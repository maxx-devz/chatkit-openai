CREATE TABLE agency_platform.connection_bindings (
  service text NOT NULL CHECK(service IN ('drive','search_console')),
  resource text NOT NULL,
  agency_id bigint NOT NULL REFERENCES agency_platform.agencies(id),
  client_id bigint,
  owner_id bigint REFERENCES public.portal_users(id),
  generation bigint NOT NULL DEFAULT 0 CHECK(generation>=0),
  PRIMARY KEY(service,resource),
  FOREIGN KEY(agency_id,client_id) REFERENCES agency_platform.client_ownership(agency_id,client_id),
  CHECK((service='drive' AND client_id IS NULL AND owner_id IS NOT NULL)
    OR (service='search_console' AND client_id IS NOT NULL AND owner_id IS NULL))
);
ALTER TABLE agency_platform.connection_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_platform.connection_bindings FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_control ON agency_platform.connection_bindings TO aoc_agency_owner USING(true) WITH CHECK(true);
INSERT INTO agency_platform.connection_bindings(service,resource,agency_id,owner_id)
 SELECT 'drive',c.owner_id::text,s.aoc_agency_id,c.owner_id FROM public.portal_drive_source_connections c
 JOIN public.portal_admins a ON a.user_id=c.owner_id AND a.is_active
 JOIN agency_platform.backfill_state s ON s.id=1 AND s.active;
INSERT INTO agency_platform.connection_bindings(service,resource,agency_id,client_id)
 SELECT 'search_console',g.website_id::text,o.agency_id,g.client_id
 FROM public.portal_website_insights_google g
 JOIN public.portal_website_insights_sites w ON w.id=g.website_id AND w.client_id=g.client_id
 JOIN agency_platform.client_ownership o ON o.client_id=g.client_id;

CREATE FUNCTION agency_platform.connection_scope(actor text,session_key text,kind text,item text,publisher bigint,client bigint)
RETURNS TABLE(agency_id bigint,generation bigint) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE person bigint; owning bigint; stored agency_platform.connection_bindings%ROWTYPE;
BEGIN
  SELECT u.id INTO person FROM public.portal_users u JOIN public."session" s ON s."userId"=u.external_id
    WHERE u.external_id=actor AND s.id=session_key AND s."expiresAt">now();
  IF person IS NULL THEN RAISE EXCEPTION 'Connection access denied' USING ERRCODE='42501'; END IF;
  IF to_regclass('public.portal_internal_users') IS NOT NULL THEN
    IF EXISTS(SELECT 1 FROM public.portal_internal_users i WHERE i.user_id=person) THEN
      RAISE EXCEPTION 'Connection access denied' USING ERRCODE='42501';
    END IF;
  END IF;
  IF kind='drive' AND publisher=person AND item=publisher::text AND client IS NULL
    AND EXISTS(SELECT 1 FROM public.portal_admins a WHERE a.user_id=person AND a.is_active)
    AND agency_platform.legacy_admin_scope_safe() THEN
    SELECT s.aoc_agency_id INTO owning FROM agency_platform.backfill_state s WHERE s.id=1 AND s.active;
  ELSIF kind='search_console' AND publisher IS NULL THEN
    SELECT w.agency_id INTO owning FROM agency_platform.request_workspaces(actor) w
      JOIN public.portal_website_insights_sites site ON site.id::text=item AND site.client_id=w.client_id AND site.archived_at IS NULL
      WHERE w.client_id=client AND w.is_aoc;
  END IF;
  IF owning IS NULL THEN RAISE EXCEPTION 'Connection access denied' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('connection:'||kind||':'||item,27));
  INSERT INTO agency_platform.connection_bindings(service,resource,agency_id,client_id,owner_id)
    VALUES(kind,item,owning,client,publisher) ON CONFLICT DO NOTHING;
  SELECT * INTO stored FROM agency_platform.connection_bindings b WHERE b.service=kind AND b.resource=item FOR UPDATE;
  IF stored.agency_id IS DISTINCT FROM owning OR stored.client_id IS DISTINCT FROM client OR stored.owner_id IS DISTINCT FROM publisher THEN
    RAISE EXCEPTION 'Connection access denied' USING ERRCODE='42501';
  END IF;
  RETURN QUERY SELECT stored.agency_id,stored.generation;
END $$;

CREATE FUNCTION agency_platform.advance_connection(actor text,session_key text,kind text,item text,publisher bigint,client bigint,expected bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE current_generation bigint;
BEGIN
  SELECT s.generation INTO current_generation FROM agency_platform.connection_scope(actor,session_key,kind,item,publisher,client) s;
  IF kind='search_console' AND NOT EXISTS(SELECT 1 FROM agency_platform.request_workspaces(actor) w
    WHERE w.client_id=client AND w.client_role='client_admin' AND w.access_level='manage') THEN
    RAISE EXCEPTION 'Connection access denied' USING ERRCODE='42501';
  END IF;
  IF current_generation IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'Connection attempt expired' USING ERRCODE='42501';
  END IF;
  UPDATE agency_platform.connection_bindings SET generation=generation+1 WHERE service=kind AND resource=item;
END $$;

CREATE FUNCTION agency_platform.drive_connection_scope(publisher bigint)
RETURNS TABLE(agency_id bigint,generation bigint) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT b.agency_id,b.generation FROM agency_platform.connection_bindings b
 JOIN agency_platform.backfill_state s ON s.active AND s.aoc_agency_id=b.agency_id
 JOIN agency_platform.agencies a ON a.id=b.agency_id AND a.is_active
 JOIN public.portal_admins p ON p.user_id=b.owner_id AND p.is_active
 WHERE b.service='drive' AND b.owner_id=publisher AND b.resource=publisher::text
$$;
REVOKE ALL ON FUNCTION agency_platform.connection_scope(text,text,text,text,bigint,bigint),
 agency_platform.advance_connection(text,text,text,text,bigint,bigint,bigint),
 agency_platform.drive_connection_scope(bigint) FROM PUBLIC;
