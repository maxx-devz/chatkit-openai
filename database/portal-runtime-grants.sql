-- Apply as the operator after all portal migrations and after privately creating
-- aoc_portal_runtime with LOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE,
-- NOREPLICATION and NOBYPASSRLS. Standard PostgreSQL; no provider SDK is used.
-- This is a shared server login. Tenant isolation remains application-enforced;
-- this migration does not create tenant row policies or grant browser access.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$
DECLARE entry record; api_role record;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'aoc_portal_runtime'
      AND rolcanlogin AND NOT rolsuper AND NOT rolcreatedb
      AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls
  ) THEN
    RAISE EXCEPTION 'Create the restricted portal runtime login privately first';
  END IF;
  FOR entry IN
    SELECT c.relname FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
      AND (left(c.relname, 7) = 'portal_'
        OR c.relname IN ('user', 'session', 'account', 'verification', 'rateLimit'))
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', entry.relname);
    FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated') LOOP
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', entry.relname, api_role.rolname);
    END LOOP;
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO aoc_portal_runtime', entry.relname);
  END LOOP;
  FOR entry IN
    SELECT c.relname FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'S'
      AND left(c.relname, 7) = 'portal_'
  LOOP
    EXECUTE format('REVOKE ALL ON SEQUENCE public.%I FROM PUBLIC', entry.relname);
    FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated') LOOP
      EXECUTE format('REVOKE ALL ON SEQUENCE public.%I FROM %I', entry.relname, api_role.rolname);
    END LOOP;
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO aoc_portal_runtime', entry.relname);
  END LOOP;
END $$;
GRANT USAGE ON SCHEMA public TO aoc_portal_runtime;
REVOKE ALL ON portal_client_document_schema FROM aoc_portal_runtime;
GRANT SELECT ON portal_client_document_schema TO aoc_portal_runtime;
REVOKE UPDATE, DELETE ON portal_client_document_assignment_audit,
  portal_document_delivery_audit, portal_document_connection_audit
  FROM aoc_portal_runtime;
REVOKE DELETE ON portal_client_document_assignments, portal_document_releases,
  portal_client_journey FROM aoc_portal_runtime;
COMMIT;
