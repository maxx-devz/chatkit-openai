-- Additive foundation. Applied by the version/checksum runner inside one
-- transaction as aoc_agency_owner. Never seed/reassign legacy customers here.
CREATE SCHEMA agency_platform AUTHORIZATION aoc_agency_owner;
REVOKE ALL ON SCHEMA agency_platform FROM PUBLIC;
GRANT USAGE ON SCHEMA agency_platform TO aoc_agency_runtime;
-- Per-schema REVOKE cannot remove the built-in global PUBLIC EXECUTE default.
-- This changes defaults only for functions created by this dedicated owner role.
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE TABLE agency_platform.schema_migrations (
  version text PRIMARY KEY,
  checksum text NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
  applied_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE agency_platform.agencies (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9_-]{1,79}$'),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 160),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE agency_platform.memberships (
  agency_id bigint NOT NULL REFERENCES agency_platform.agencies(id),
  user_id bigint NOT NULL REFERENCES public.portal_users(id),
  role text NOT NULL CHECK (role IN ('agency_admin', 'staff')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (agency_id, user_id)
);
CREATE TABLE agency_platform.client_ownership (
  client_id bigint PRIMARY KEY REFERENCES public.portal_clients(id),
  agency_id bigint NOT NULL REFERENCES agency_platform.agencies(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agency_id, client_id)
);
CREATE TABLE agency_platform.client_access (
  agency_id bigint NOT NULL,
  client_id bigint NOT NULL,
  user_id bigint NOT NULL,
  access_level text NOT NULL CHECK (access_level IN ('read', 'contribute', 'manage')),
  is_active boolean NOT NULL DEFAULT true,
  PRIMARY KEY (agency_id, client_id, user_id),
  CONSTRAINT agency_client_access_owner_fk FOREIGN KEY (agency_id, client_id)
    REFERENCES agency_platform.client_ownership(agency_id, client_id),
  CONSTRAINT agency_client_access_member_fk FOREIGN KEY (agency_id, user_id)
    REFERENCES agency_platform.memberships(agency_id, user_id),
  CONSTRAINT agency_client_access_legacy_fk FOREIGN KEY (client_id, user_id)
    REFERENCES public.portal_memberships(client_id, user_id) ON DELETE CASCADE
);
CREATE INDEX agency_memberships_user ON agency_platform.memberships(user_id, agency_id);
CREATE INDEX agency_access_user ON agency_platform.client_access(user_id, agency_id, client_id);

-- A database LOGIN is bound to exactly one agency. No runtime may edit this
-- mapping. session_user, unlike a user-set custom setting, authenticates the
-- connection. Shared/global migration/service logins must not be registered.
CREATE TABLE agency_platform.database_principals (
  login_role name PRIMARY KEY,
  agency_id bigint NOT NULL REFERENCES agency_platform.agencies(id),
  is_active boolean NOT NULL DEFAULT true
);

-- Classification/locator metadata ONLY, never credential values or file bodies.
-- This is not permission to read a legacy backing table/provider object.
CREATE TABLE agency_platform.resources (
  id uuid PRIMARY KEY,
  resource_kind text NOT NULL CHECK (resource_kind IN
    ('source_pack','credential','audit_record','generated_asset','billing_reference','website_report','integration_job')),
  resource_key text NOT NULL CHECK (length(resource_key) BETWEEN 1 AND 200),
  scope_kind text NOT NULL CHECK (scope_kind IN
    ('platform_private','platform_common','agency','client','quarantined')),
  agency_id bigint REFERENCES agency_platform.agencies(id),
  client_id bigint,
  created_by bigint NOT NULL REFERENCES public.portal_users(id),
  approved_by bigint REFERENCES public.portal_users(id),
  approved_at timestamptz,
  approval_reference text CHECK (length(approval_reference) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agency_resource_owner_fk FOREIGN KEY (agency_id, client_id)
    REFERENCES agency_platform.client_ownership(agency_id, client_id),
  CONSTRAINT agency_resource_scope CHECK (
    (scope_kind='client' AND agency_id IS NOT NULL AND client_id IS NOT NULL) OR
    (scope_kind='agency' AND agency_id IS NOT NULL AND client_id IS NULL) OR
    (scope_kind IN ('platform_private','platform_common','quarantined')
      AND agency_id IS NULL AND client_id IS NULL)),
  CONSTRAINT agency_common_approval CHECK (
    scope_kind<>'platform_common' OR (resource_kind='source_pack'
      AND approved_by IS NOT NULL AND approved_at IS NOT NULL AND approval_reference IS NOT NULL))
);
CREATE INDEX agency_resources_scope ON agency_platform.resources(agency_id, client_id, resource_kind);
CREATE UNIQUE INDEX agency_resource_client_key ON agency_platform.resources
  (agency_id,client_id,resource_kind,resource_key) WHERE scope_kind='client';
CREATE UNIQUE INDEX agency_resource_agency_key ON agency_platform.resources
  (agency_id,resource_kind,resource_key) WHERE scope_kind='agency';
CREATE UNIQUE INDEX agency_resource_platform_key ON agency_platform.resources
  (scope_kind,resource_kind,resource_key) WHERE scope_kind IN ('platform_private','platform_common','quarantined');

-- Explicit inventory defaults, not grants. Missing individual classifications
-- remain unavailable to new agency paths; NULL client/agency never means public.
CREATE TABLE agency_platform.legacy_classifications (
  relation_name text PRIMARY KEY,
  classification text NOT NULL CHECK (classification IN
    ('platform_private','client_scoped_unbound','legacy_quarantined','internal_private')),
  review_note text NOT NULL
);
INSERT INTO agency_platform.legacy_classifications VALUES
 ('portal_users','platform_private','Shared identity; agency membership is independent; never expose all identity rows.'),
 ('portal_admins','platform_private','Global operations authority is not agency support consent.'),
 ('portal_ai_credentials','platform_private','Encrypted service credentials; no customer-readable global secret.'),
 ('portal_ai_active_provider','platform_private','Shared execution selection, not shared customer data.'),
 ('portal_site_ai_settings','platform_private','Product execution configuration; no implicit knowledge audience.'),
 ('portal_hubstaff_tokens','platform_private','Service token; client bindings and ownership need separate review.'),
 ('portal_drive_source_connections','platform_private','OAuth grant owner/root must be classified before agency adoption.'),
 ('portal_prepared_source_indexes','legacy_quarantined','May mix private/admin/client texts; do not auto-publish.'),
 ('portal_source_publications','legacy_quarantined','Existing clients audience is global; approve each common pack explicitly.'),
 ('portal_audit_events','client_scoped_unbound','Client and global operational events; retain original scope and evidence.'),
 ('portal_ai_usage_events','client_scoped_unbound','Financial/activity metadata; NULL client is not a global read grant.'),
 ('portal_ai_usage_resets','client_scoped_unbound','Report reset boundaries never grant agency-wide finance access.'),
 ('portal_client_access_audit','client_scoped_unbound','Preserve original client/actor/target scope and audit retention.'),
 ('portal_integration_runs','client_scoped_unbound','Job metadata may contain customer identifiers.'),
 ('portal_ai_cost_events','client_scoped_unbound','Archived/NULL-client evidence remains private; not a public billing row.'),
 ('portal_ai_credit_pricing','platform_private','Reporting rates are not subscription/staffing prices or payment capability.'),
 ('portal_ai_credit_periods','client_scoped_unbound','Reporting allowance; establish agency/client ownership before reuse.'),
 ('portal_ai_credit_entries','client_scoped_unbound','Retain archived financial references; no inferred cross-agency visibility.'),
 ('portal_chatkit_threads','client_scoped_unbound','Preserve client/user/thread/mode ownership.'),
 ('portal_chatkit_items','client_scoped_unbound','Conversation/generated content inherits its thread, not provider ownership.'),
 ('portal_chatkit_leases','client_scoped_unbound','Conversation locks retain client/user/thread context.'),
 ('portal_chatkit_uploads','client_scoped_unbound','File bytes and generated assets remain client/user scoped.'),
 ('portal_assistant_files','client_scoped_unbound','Resolve builder/version/client provenance before classification.'),
 ('portal_assistant_configs','legacy_quarantined','Builder/admin/client scope needs explicit classification; no global fallback.'),
 ('portal_client_library','client_scoped_unbound','Existing client audience remains authoritative.'),
 ('portal_website_insights_sites','client_scoped_unbound','Public URL does not make private reports or Google grants public.'),
 ('portal_website_insights_reports','client_scoped_unbound','Reports inherit owning client and approved Google property.'),
 ('portal_website_insights_google','client_scoped_unbound','Encrypted client/site Google grant; never publish as common metadata.'),
 ('portal_website_insights_oauth_states','client_scoped_unbound','Single-use login/client/site consent state; never agency-shared.'),
 ('portal_hubstaff_search_indexes','client_scoped_unbound','Preserve approved client/project binding and freshness.'),
 ('portal_hubstaff_search_tasks','client_scoped_unbound','Indexed task content inherits client/project scope.'),
 ('portal_hubstaff_search_comments','client_scoped_unbound','Indexed comments inherit client/project scope.'),
 ('portal_internal_users','internal_private','Internal Portal is outside agency mode; do not adopt its personnel data.'),
 ('portal_internal_sync_snapshots','internal_private','HR/PM/personnel snapshots remain in the Internal trust boundary.');

-- Runtime roles and their inherited privileges must be reviewed before use.
-- This function fails closed if an allegedly restricted login has broad legacy
-- access, privileged role membership or schema creation privileges.
CREATE FUNCTION agency_platform.runtime_role_safe() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
  SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname=session_user
      AND r.rolcanlogin AND NOT (r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication))
    AND pg_catalog.pg_has_role(session_user,'aoc_agency_runtime','MEMBER')
    AND NOT pg_catalog.pg_has_role(session_user,'aoc_agency_owner','MEMBER')
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles r
      WHERE (r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication)
        AND pg_catalog.pg_has_role(session_user,r.oid,'MEMBER'))
    AND NOT pg_catalog.has_schema_privilege(session_user,'agency_platform','CREATE')
    AND NOT pg_catalog.has_schema_privilege(session_user,'public','CREATE')
    AND NOT pg_catalog.has_database_privilege(session_user,pg_catalog.current_database(),'CREATE')
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='agency_platform' AND pg_catalog.pg_has_role(session_user,c.relowner,'MEMBER'))
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='agency_platform' AND pg_catalog.pg_has_role(session_user,p.proowner,'MEMBER'))
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f')
        AND pg_catalog.has_table_privilege(session_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
$fn$;

CREATE FUNCTION agency_platform.context_id(setting_name text) RETURNS bigint
LANGUAGE plpgsql STABLE SET search_path=pg_catalog,pg_temp AS $fn$
DECLARE value text := pg_catalog.current_setting(setting_name,true);
BEGIN
  IF value IS NULL OR value !~ '^[1-9][0-9]{0,18}$' THEN RETURN NULL; END IF;
  BEGIN RETURN value::bigint;
  EXCEPTION WHEN numeric_value_out_of_range THEN RETURN NULL;
  END;
END
$fn$;

CREATE FUNCTION agency_platform.current_agency() RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
  SELECT p.agency_id FROM agency_platform.database_principals p
    JOIN agency_platform.agencies a ON a.id=p.agency_id AND a.is_active
    JOIN agency_platform.memberships m ON m.agency_id=p.agency_id AND m.is_active
  WHERE p.login_role=session_user AND p.is_active
    AND p.agency_id=agency_platform.context_id('aoc.agency_id')
    AND m.user_id=agency_platform.context_id('aoc.actor_id')
    AND agency_platform.runtime_role_safe()
$fn$;

CREATE FUNCTION agency_platform.client_allowed(target_client bigint, require_write boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
  SELECT EXISTS (SELECT 1 FROM agency_platform.client_access g
    JOIN public.portal_memberships pm ON pm.client_id=g.client_id AND pm.user_id=g.user_id AND pm.is_active
    WHERE g.agency_id=agency_platform.current_agency() AND g.is_active
      AND g.user_id=agency_platform.context_id('aoc.actor_id') AND g.client_id=target_client
      AND target_client=agency_platform.context_id('aoc.client_id')
      AND (NOT require_write OR (g.access_level IN ('contribute','manage')
        AND pm.role IN ('member','client_admin','aoc_admin'))))
$fn$;

-- The owner is an explicit trusted control-plane exception, including inside
-- the narrowly defined functions above. FORCE does not protect against an owner
-- changing policies, nor against superuser/BYPASSRLS. Never use owner at runtime.
DO $policies$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['schema_migrations','agencies','memberships',
    'client_ownership','client_access','database_principals','resources','legacy_classifications'] LOOP
    EXECUTE format('ALTER TABLE agency_platform.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE agency_platform.%I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY owner_control ON agency_platform.%I TO aoc_agency_owner USING (true) WITH CHECK (true)',table_name);
  END LOOP;
END
$policies$;

GRANT SELECT ON agency_platform.agencies, agency_platform.memberships,
  agency_platform.client_ownership, agency_platform.client_access,
  agency_platform.resources TO aoc_agency_runtime;
GRANT INSERT, UPDATE, DELETE ON agency_platform.resources TO aoc_agency_runtime;
-- No runtime DDL, TRUNCATE, REFERENCES, grants, principal/membership writes,
-- global credential reads or legacy backing-table grants.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA agency_platform FROM PUBLIC;
GRANT EXECUTE ON FUNCTION agency_platform.context_id(text),
  agency_platform.runtime_role_safe(), agency_platform.current_agency(),
  agency_platform.client_allowed(bigint,boolean) TO aoc_agency_runtime;

CREATE POLICY agency_read ON agency_platform.agencies FOR SELECT TO aoc_agency_runtime
  USING (id=(SELECT agency_platform.current_agency()));
CREATE POLICY membership_read ON agency_platform.memberships FOR SELECT TO aoc_agency_runtime
  USING (agency_id=(SELECT agency_platform.current_agency())
    AND user_id=agency_platform.context_id('aoc.actor_id'));
CREATE POLICY ownership_read ON agency_platform.client_ownership FOR SELECT TO aoc_agency_runtime
  USING (agency_id=(SELECT agency_platform.current_agency())
    AND agency_platform.client_allowed(client_id));
CREATE POLICY access_read ON agency_platform.client_access FOR SELECT TO aoc_agency_runtime
  USING (agency_id=(SELECT agency_platform.current_agency())
    AND user_id=agency_platform.context_id('aoc.actor_id')
    AND agency_platform.client_allowed(client_id));
CREATE POLICY resource_read ON agency_platform.resources FOR SELECT TO aoc_agency_runtime
  USING ((SELECT agency_platform.current_agency()) IS NOT NULL
    AND resource_kind IN ('source_pack','generated_asset','website_report','integration_job') AND (
    (scope_kind='platform_common' AND resource_kind='source_pack' AND approved_at IS NOT NULL) OR
    (scope_kind='agency' AND agency_id=(SELECT agency_platform.current_agency())) OR
    (scope_kind='client' AND agency_id=(SELECT agency_platform.current_agency())
      AND agency_platform.client_allowed(client_id))));
CREATE POLICY resource_insert ON agency_platform.resources FOR INSERT TO aoc_agency_runtime
  WITH CHECK (scope_kind='client' AND resource_kind='generated_asset'
    AND agency_id=(SELECT agency_platform.current_agency())
    AND created_by=agency_platform.context_id('aoc.actor_id')
    AND approved_by IS NULL AND approved_at IS NULL AND approval_reference IS NULL
    AND agency_platform.client_allowed(client_id,true));
CREATE POLICY resource_update ON agency_platform.resources FOR UPDATE TO aoc_agency_runtime
  USING (scope_kind='client' AND resource_kind='generated_asset'
    AND agency_id=(SELECT agency_platform.current_agency())
    AND created_by=agency_platform.context_id('aoc.actor_id')
    AND agency_platform.client_allowed(client_id,true))
  WITH CHECK (scope_kind='client' AND resource_kind='generated_asset'
    AND agency_id=(SELECT agency_platform.current_agency())
    AND created_by=agency_platform.context_id('aoc.actor_id')
    AND approved_by IS NULL AND approved_at IS NULL AND approval_reference IS NULL
    AND agency_platform.client_allowed(client_id,true));
CREATE POLICY resource_delete ON agency_platform.resources FOR DELETE TO aoc_agency_runtime
  USING (scope_kind='client' AND resource_kind='generated_asset'
    AND agency_id=(SELECT agency_platform.current_agency())
    AND created_by=agency_platform.context_id('aoc.actor_id')
    AND agency_platform.client_allowed(client_id,true));

COMMENT ON SCHEMA agency_platform IS
  'Stage 03 foundation only; agency routes disabled until Stage 11. Legacy data is not migrated or protected by these new policies.';
