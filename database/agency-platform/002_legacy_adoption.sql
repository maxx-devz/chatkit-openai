-- Stage 04 additive ownership overlay. Applied transactionally by the backfill
-- runner after its read-only plan and conflict validation; no legacy row rewrite.
ALTER TABLE agency_platform.memberships DROP CONSTRAINT memberships_role_check;
ALTER TABLE agency_platform.memberships ADD CONSTRAINT memberships_role_check
  CHECK (role IN ('agency_admin','staff','client_user'));

CREATE TABLE agency_platform.backfill_batches (
  id text PRIMARY KEY CHECK (id ~ '^[0-9a-f]{64}$'),
  manifest_digest text NOT NULL,
  source_digest text NOT NULL,
  operator_user_id bigint NOT NULL REFERENCES public.portal_users(id),
  approval_reference text NOT NULL CHECK (length(approval_reference) BETWEEN 1 AND 120),
  applied_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE agency_platform.backfill_state (
  id integer PRIMARY KEY CHECK (id=1),
  aoc_agency_id bigint NOT NULL REFERENCES agency_platform.agencies(id),
  active boolean NOT NULL DEFAULT false
);
CREATE TABLE agency_platform.legacy_catalog (
  relation_name text PRIMARY KEY CHECK (relation_name ~ '^portal_[a-z0-9_]+$' AND relation_name !~ '^portal_internal_'),
  key_columns text[] NOT NULL CHECK (cardinality(key_columns)>0),
  resource_kind text NOT NULL,
  data_access text NOT NULL CHECK (data_access IN ('private','user_private','client_shared','agency_source')),
  client_bound boolean NOT NULL
);
CREATE TABLE agency_platform.source_approvals (
  relation_name text NOT NULL REFERENCES agency_platform.legacy_catalog(relation_name),
  record_key jsonb NOT NULL,
  agency_id bigint NOT NULL REFERENCES agency_platform.agencies(id),
  approval_reference text NOT NULL,
  PRIMARY KEY(relation_name,record_key)
);
CREATE TABLE agency_platform.legacy_ownership (
  relation_name text NOT NULL REFERENCES agency_platform.legacy_catalog(relation_name),
  record_key jsonb NOT NULL CHECK (jsonb_typeof(record_key)='object' AND octet_length(record_key::text)<=1000),
  scope_kind text NOT NULL CHECK (scope_kind IN ('client','agency','platform_private','quarantined')),
  agency_id bigint REFERENCES agency_platform.agencies(id),
  client_id bigint,
  row_owner_id text,
  reason text NOT NULL,
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  batch_id text REFERENCES agency_platform.backfill_batches(id),
  PRIMARY KEY(relation_name,record_key),
  FOREIGN KEY(agency_id,client_id) REFERENCES agency_platform.client_ownership(agency_id,client_id),
  CHECK ((scope_kind='client' AND agency_id IS NOT NULL AND client_id IS NOT NULL)
    OR (scope_kind='agency' AND agency_id IS NOT NULL AND client_id IS NULL)
    OR (scope_kind IN ('platform_private','quarantined') AND agency_id IS NULL AND client_id IS NULL))
);
CREATE INDEX legacy_ownership_scope ON agency_platform.legacy_ownership(agency_id,client_id,relation_name);
CREATE TABLE agency_platform.legacy_ownership_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  relation_name text NOT NULL,
  record_key jsonb NOT NULL,
  previous_scope text,
  next_scope text NOT NULL,
  reason text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

DO $policies$
DECLARE name text;
BEGIN
  FOREACH name IN ARRAY ARRAY['backfill_batches','backfill_state','legacy_catalog','source_approvals','legacy_ownership','legacy_ownership_audit'] LOOP
    EXECUTE format('ALTER TABLE agency_platform.%I ENABLE ROW LEVEL SECURITY',name);
    EXECUTE format('ALTER TABLE agency_platform.%I FORCE ROW LEVEL SECURITY',name);
    EXECUTE format('CREATE POLICY owner_control ON agency_platform.%I TO aoc_agency_owner USING (true) WITH CHECK (true)',name);
  END LOOP;
END
$policies$;

CREATE FUNCTION agency_platform.legacy_key(payload jsonb, columns text[]) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $fn$
  SELECT jsonb_object_agg(k,payload->>k) FROM unnest(columns) k
$fn$;
CREATE FUNCTION agency_platform.legacy_fingerprint(payload jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $fn$
  SELECT encode(sha256(convert_to(payload::text,'UTF8')),'hex')
$fn$;

CREATE FUNCTION agency_platform.legacy_parents_valid(relation text,payload jsonb) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE fk record; clause text; valid boolean;
BEGIN
  FOR fk IN SELECT con.confrelid::regclass AS parent,
    array_agg(ca.attname::text ORDER BY k.n) AS children,array_agg(pa.attname::text ORDER BY k.n) AS parents
    FROM pg_constraint con JOIN unnest(con.conkey,con.confkey) WITH ORDINALITY k(ca,pa,n) ON true
    JOIN pg_attribute ca ON ca.attrelid=con.conrelid AND ca.attnum=k.ca
    JOIN pg_attribute pa ON pa.attrelid=con.confrelid AND pa.attnum=k.pa
    WHERE con.contype='f' AND con.conrelid=to_regclass(format('public.%I',relation)) GROUP BY con.oid LOOP
    IF EXISTS(SELECT 1 FROM unnest(fk.children) k WHERE payload->>k IS NULL) THEN CONTINUE; END IF;
    SELECT string_agg(format('to_jsonb(p)->>%L=$1->>%L',fk.parents[i],fk.children[i]),' AND ')
      INTO clause FROM generate_subscripts(fk.children,1) i;
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM %s p WHERE %s)',fk.parent,clause) INTO valid USING payload;
    IF NOT valid THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END
$fn$;

CREATE FUNCTION agency_platform.audit_legacy_ownership() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
BEGIN
  IF TG_OP='INSERT' OR ROW(OLD.scope_kind,OLD.agency_id,OLD.client_id,OLD.reason,OLD.fingerprint)
    IS DISTINCT FROM ROW(NEW.scope_kind,NEW.agency_id,NEW.client_id,NEW.reason,NEW.fingerprint) THEN
    INSERT INTO agency_platform.legacy_ownership_audit(relation_name,record_key,previous_scope,next_scope,reason)
      VALUES(NEW.relation_name,NEW.record_key,CASE WHEN TG_OP='INSERT' THEN NULL ELSE OLD.scope_kind END,NEW.scope_kind,NEW.reason);
  END IF;
  RETURN NEW;
END
$fn$;
CREATE TRIGGER ownership_audit AFTER INSERT OR UPDATE ON agency_platform.legacy_ownership
  FOR EACH ROW EXECUTE FUNCTION agency_platform.audit_legacy_ownership();

-- After cutover, existing client writers keep using their identifiers/tables.
-- Known client rows gain ownership atomically in the same transaction. Unknown
-- clients and ambiguous sources stay closed; no implicit client/agency adoption.
CREATE FUNCTION agency_platform.track_legacy_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET timezone='UTC' AS $fn$
DECLARE catalog agency_platform.legacy_catalog%ROWTYPE; payload jsonb; key jsonb;
  source_client bigint; owning bigint; aoc bigint; scope text:='quarantined'; reason text:='unapproved_client';
BEGIN
  SELECT aoc_agency_id INTO aoc FROM agency_platform.backfill_state WHERE id=1 AND active;
  IF aoc IS NULL THEN RETURN COALESCE(NEW,OLD); END IF;
  SELECT * INTO STRICT catalog FROM agency_platform.legacy_catalog WHERE relation_name=TG_TABLE_NAME;
  payload:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  key:=agency_platform.legacy_key(payload,catalog.key_columns);
  IF TG_OP='UPDATE' AND agency_platform.legacy_key(to_jsonb(OLD),catalog.key_columns) IS DISTINCT FROM key THEN
    RAISE EXCEPTION 'Legacy identifiers cannot be moved in place' USING ERRCODE='23514';
  END IF;
  IF TG_OP='DELETE' THEN reason:='record_deleted';
  ELSIF NOT agency_platform.legacy_parents_valid(TG_TABLE_NAME,payload) THEN reason:='orphan_reference';
  ELSIF TG_TABLE_NAME='portal_source_publications' THEN
    source_client:=(payload->>'client_id')::bigint;
    IF source_client IS NOT NULL THEN
      SELECT agency_id INTO owning FROM agency_platform.client_ownership WHERE client_id=source_client;
      IF owning=aoc AND EXISTS(SELECT 1 FROM agency_platform.memberships m JOIN public.portal_admins p ON p.user_id=m.user_id AND p.is_active
        WHERE m.agency_id=aoc AND m.role='agency_admin' AND m.is_active AND m.user_id=(payload->>'owner_id')::bigint) THEN
        scope:='client';reason:='client_publication';
      ELSE owning:=NULL;source_client:=NULL;reason:='unapproved_source_owner'; END IF;
    ELSIF payload->>'audience'='admin' THEN scope:='platform_private';reason:='private_admin_source';
    ELSE
      SELECT agency_id INTO owning FROM agency_platform.source_approvals WHERE relation_name=TG_TABLE_NAME AND record_key=key;
      IF owning IS NOT NULL THEN scope:='agency';reason:='approved_aoc_guidance'; ELSE reason:='source_review_required'; END IF;
    END IF;
  ELSE
    source_client:=CASE WHEN TG_TABLE_NAME='portal_clients' THEN (payload->>'id')::bigint ELSE (payload->>'client_id')::bigint END;
    SELECT agency_id INTO owning FROM agency_platform.client_ownership WHERE client_id=source_client;
    IF owning IS NOT NULL THEN
      IF catalog.data_access='user_private' AND payload->>'user_id' IS NULL THEN owning:=NULL;source_client:=NULL;reason:='missing_user_owner';
      ELSE scope:='client';reason:='client_ownership'; END IF;
    ELSE source_client:=NULL;reason:='archived_or_ambiguous_client'; END IF;
  END IF;
  IF TG_OP='DELETE' THEN owning:=NULL;source_client:=NULL; END IF;
  INSERT INTO agency_platform.legacy_ownership(relation_name,record_key,scope_kind,agency_id,client_id,row_owner_id,reason,fingerprint)
    VALUES(TG_TABLE_NAME,key,scope,owning,source_client,payload->>'user_id',reason,agency_platform.legacy_fingerprint(payload))
    ON CONFLICT(relation_name,record_key) DO UPDATE SET scope_kind=EXCLUDED.scope_kind,agency_id=EXCLUDED.agency_id,
      client_id=EXCLUDED.client_id,row_owner_id=EXCLUDED.row_owner_id,reason=EXCLUDED.reason,fingerprint=EXCLUDED.fingerprint
    WHERE ROW(legacy_ownership.scope_kind,legacy_ownership.agency_id,legacy_ownership.client_id,legacy_ownership.row_owner_id,legacy_ownership.reason,legacy_ownership.fingerprint)
      IS DISTINCT FROM ROW(EXCLUDED.scope_kind,EXCLUDED.agency_id,EXCLUDED.client_id,EXCLUDED.row_owner_id,EXCLUDED.reason,EXCLUDED.fingerprint);
  IF TG_TABLE_NAME='portal_memberships' THEN
    SELECT agency_id INTO owning FROM agency_platform.client_ownership WHERE client_id=(payload->>'client_id')::bigint;
    IF owning=aoc THEN
      INSERT INTO agency_platform.memberships(agency_id,user_id,role,is_active)
        SELECT aoc,(payload->>'user_id')::bigint,'client_user',EXISTS(SELECT 1 FROM public.portal_memberships p
          JOIN agency_platform.client_ownership c ON c.client_id=p.client_id AND c.agency_id=aoc
          WHERE p.user_id=(payload->>'user_id')::bigint AND p.is_active)
        ON CONFLICT(agency_id,user_id) DO UPDATE SET is_active=EXCLUDED.is_active
        WHERE memberships.role='client_user' AND memberships.is_active IS DISTINCT FROM EXCLUDED.is_active;
      IF TG_OP<>'DELETE' THEN
        INSERT INTO agency_platform.client_access(agency_id,client_id,user_id,access_level,is_active)
          VALUES(aoc,(payload->>'client_id')::bigint,(payload->>'user_id')::bigint,
            CASE payload->>'role' WHEN 'client_viewer' THEN 'read' WHEN 'client_admin' THEN 'manage' ELSE 'contribute' END,
            (payload->>'is_active')::boolean)
          ON CONFLICT(agency_id,client_id,user_id) DO UPDATE SET access_level=EXCLUDED.access_level,is_active=EXCLUDED.is_active
          WHERE ROW(client_access.access_level,client_access.is_active) IS DISTINCT FROM ROW(EXCLUDED.access_level,EXCLUDED.is_active);
      END IF;
    END IF;
  END IF;
  RETURN COALESCE(NEW,OLD);
END
$fn$;

CREATE FUNCTION agency_platform.owned_legacy_record(relation text,key jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET timezone='UTC' AS $fn$
DECLARE binding agency_platform.legacy_ownership%ROWTYPE; catalog agency_platform.legacy_catalog%ROWTYPE; payload jsonb; owning bigint;
BEGIN
  owning:=agency_platform.current_agency();
  IF owning IS NULL OR NOT agency_platform.client_allowed(agency_platform.context_id('aoc.client_id')) THEN RETURN NULL; END IF;
  SELECT * INTO binding FROM agency_platform.legacy_ownership WHERE relation_name=relation AND record_key=key;
  SELECT * INTO catalog FROM agency_platform.legacy_catalog WHERE relation_name=relation;
  IF binding.agency_id IS DISTINCT FROM owning OR binding.scope_kind NOT IN ('client','agency') OR catalog.data_access='private' THEN RETURN NULL; END IF;
  IF binding.scope_kind='client' AND NOT agency_platform.client_allowed(binding.client_id) THEN RETURN NULL; END IF;
  IF catalog.data_access='user_private' AND binding.row_owner_id IS DISTINCT FROM agency_platform.context_id('aoc.actor_id')::text THEN RETURN NULL; END IF;
  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE agency_platform.legacy_key(to_jsonb(t),$1)=$2',relation)
    INTO payload USING catalog.key_columns,key;
  IF payload IS NULL OR agency_platform.legacy_fingerprint(payload) IS DISTINCT FROM binding.fingerprint THEN RETURN NULL; END IF;
  IF relation='portal_source_publications' AND NOT EXISTS(
    SELECT 1 FROM public.portal_admins WHERE user_id=(payload->>'owner_id')::bigint AND is_active
  ) THEN RETURN NULL; END IF;
  RETURN payload;
END
$fn$;

-- Narrow compatibility predicates for existing authenticated legacy AOC paths.
-- They do not authenticate a caller and are not new public tenant routes.
CREATE FUNCTION agency_platform.legacy_aoc_client(client bigint) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
  SELECT EXISTS(SELECT 1 FROM agency_platform.backfill_state s JOIN agency_platform.client_ownership c ON c.agency_id=s.aoc_agency_id
    WHERE s.id=1 AND s.active AND c.client_id=client)
$fn$;
CREATE FUNCTION agency_platform.legacy_aoc_clients(clients bigint[]) RETURNS SETOF bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
  SELECT c.client_id FROM agency_platform.backfill_state s JOIN agency_platform.client_ownership c ON c.agency_id=s.aoc_agency_id
    WHERE s.id=1 AND s.active AND c.client_id=ANY(clients)
$fn$;
CREATE FUNCTION agency_platform.legacy_publication_allowed(publisher bigint,audience_name text,client bigint,admin_owner bigint) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
  SELECT EXISTS(SELECT 1 FROM agency_platform.legacy_ownership o JOIN agency_platform.backfill_state s ON s.id=1 AND s.active
    WHERE o.relation_name='portal_source_publications'
      AND EXISTS(SELECT 1 FROM public.portal_admins WHERE user_id=publisher AND is_active)
      AND o.record_key=jsonb_build_object('owner_id',publisher::text,'audience',audience_name)
      AND ((client IS NOT NULL AND agency_platform.legacy_aoc_client(client) AND o.agency_id=s.aoc_agency_id
        AND (o.scope_kind='agency' OR (o.scope_kind='client' AND o.client_id=client)))
      OR (client IS NULL AND admin_owner=publisher AND o.scope_kind IN ('agency','platform_private'))))
$fn$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA agency_platform FROM PUBLIC;
GRANT EXECUTE ON FUNCTION agency_platform.owned_legacy_record(text,jsonb) TO aoc_agency_runtime;
