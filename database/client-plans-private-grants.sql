-- Version 2: override host default privileges for server-only plan data.
-- Optional role names match the existing portability/grants decision; no SDK or RLS claim.
REVOKE ALL ON portal_client_plans,portal_client_plan_months,portal_client_plan_requests,
 portal_client_plan_topups,portal_client_plan_runs,portal_client_plan_audit,
 portal_client_plan_operations,portal_client_plan_schema_versions,portal_client_plan_balances FROM PUBLIC;
REVOKE ALL ON SEQUENCE portal_client_plan_audit_id_seq FROM PUBLIC;
DO $$
DECLARE browser_role TEXT;
BEGIN
 FOREACH browser_role IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=browser_role) THEN
   EXECUTE format('REVOKE ALL ON portal_client_plans,portal_client_plan_months,portal_client_plan_requests,portal_client_plan_topups,portal_client_plan_runs,portal_client_plan_audit,portal_client_plan_operations,portal_client_plan_schema_versions,portal_client_plan_balances FROM %I',browser_role);
   EXECUTE format('REVOKE ALL ON SEQUENCE portal_client_plan_audit_id_seq FROM %I',browser_role);
  END IF;
 END LOOP;
END $$;
