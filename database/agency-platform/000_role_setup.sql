-- Privileged setup, REVIEW ONLY until a disposable/staging target is approved.
-- Run as that database's authorized owner, after the existing core/client-access
-- migrations. No passwords, LOGIN roles, agency grants or application mode here.
BEGIN;
DO $setup$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['aoc_agency_owner', 'aoc_agency_runtime'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', role_name);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=role_name
      AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) THEN
      RAISE EXCEPTION 'An agency group role has unsafe attributes';
    END IF;
  END LOOP;
  IF pg_catalog.pg_has_role('aoc_agency_runtime', 'aoc_agency_owner', 'MEMBER') THEN
    RAISE EXCEPTION 'Runtime must not be a member of the owner role';
  END IF;
  -- Only the setup/migration operator receives the owner role. Never grant it
  -- to an application login, a service runtime or the runtime group.
  EXECUTE format('GRANT aoc_agency_owner TO %I', current_user);
  EXECUTE format('GRANT CREATE ON DATABASE %I TO aoc_agency_owner', current_database());
END
$setup$;
GRANT USAGE ON SCHEMA public TO aoc_agency_owner;
GRANT REFERENCES (id) ON public.portal_clients, public.portal_users TO aoc_agency_owner;
GRANT REFERENCES (client_id, user_id) ON public.portal_memberships TO aoc_agency_owner;
GRANT SELECT (client_id, user_id, role, is_active) ON public.portal_memberships TO aoc_agency_owner;
COMMIT;
