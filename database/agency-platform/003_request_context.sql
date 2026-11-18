-- Run under the dedicated owner after the Stage 04 adoption.
CREATE FUNCTION agency_platform.request_workspaces(actor text)
RETURNS TABLE(client_id bigint, agency_id bigint, agency_slug text, agency_name text,
              agency_role text, client_role text, access_level text, is_aoc boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
  SELECT c.id,a.id,a.slug,a.display_name,m.role,p.role,g.access_level,a.id=s.aoc_agency_id
  FROM public.portal_users u
  JOIN agency_platform.memberships m ON m.user_id=u.id AND m.is_active
  JOIN agency_platform.agencies a ON a.id=m.agency_id AND a.is_active
  JOIN agency_platform.client_access g ON g.agency_id=a.id AND g.user_id=u.id AND g.is_active
  JOIN agency_platform.client_ownership o ON (o.agency_id,o.client_id)=(g.agency_id,g.client_id)
  JOIN public.portal_clients c ON c.id=o.client_id AND c.portal_enabled
  JOIN public.portal_memberships p ON p.client_id=c.id AND p.user_id=u.id AND p.is_active
  JOIN agency_platform.backfill_state s ON s.id=1 AND s.active
  WHERE u.external_id=actor
$$;

-- Agency metadata only. A staff member can hold this role without a client assignment.
CREATE FUNCTION agency_platform.request_agency(actor text, target bigint)
RETURNS TABLE(id bigint, slug text, role text, actor_id bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
  SELECT a.id,a.slug,m.role,u.id
  FROM public.portal_users u
  JOIN agency_platform.memberships m ON m.user_id=u.id AND m.is_active AND m.role IN ('agency_admin','staff')
  JOIN agency_platform.agencies a ON a.id=m.agency_id AND a.is_active
  JOIN agency_platform.backfill_state s ON s.id=1 AND s.active
  WHERE u.external_id=actor AND a.id=target
$$;

-- Existing global Admin data queries traverse all legacy clients. Until their
-- individual replacements exist, they can run only within an all-AOC estate.
CREATE FUNCTION agency_platform.legacy_admin_scope_safe() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
  SELECT EXISTS(SELECT 1 FROM agency_platform.backfill_state s
    JOIN agency_platform.agencies a ON a.id=s.aoc_agency_id AND a.is_active
    WHERE s.id=1 AND s.active AND NOT EXISTS(
      SELECT 1 FROM public.portal_clients c WHERE NOT EXISTS(
        SELECT 1 FROM agency_platform.client_ownership o WHERE o.client_id=c.id AND o.agency_id=a.id)))
$$;

CREATE TABLE agency_platform.support_grants (
  id uuid PRIMARY KEY,
  agency_id bigint NOT NULL,
  client_id bigint NOT NULL,
  actor_id bigint NOT NULL REFERENCES public.portal_users(id),
  agency_approver bigint NOT NULL REFERENCES public.portal_users(id),
  client_approver bigint NOT NULL REFERENCES public.portal_users(id),
  reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 3 AND 200),
  ticket text NOT NULL CHECK(length(trim(ticket)) BETWEEN 1 AND 100),
  action text NOT NULL CHECK(action='support.workspace.status.read'),
  approved_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK(actor_id<>agency_approver AND actor_id<>client_approver AND agency_approver<>client_approver),
  CHECK(expires_at>approved_at AND expires_at<=approved_at+interval '1 hour'),
  FOREIGN KEY(agency_id,client_id) REFERENCES agency_platform.client_ownership(agency_id,client_id)
);
CREATE TABLE agency_platform.support_access_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  grant_id uuid NOT NULL, actor_id bigint NOT NULL, agency_id bigint NOT NULL, client_id bigint NOT NULL,
  action text NOT NULL, outcome text NOT NULL
);
ALTER TABLE agency_platform.support_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_platform.support_grants FORCE ROW LEVEL SECURITY;
ALTER TABLE agency_platform.support_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_platform.support_access_log FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_control ON agency_platform.support_grants TO aoc_agency_owner USING(true) WITH CHECK(true);
CREATE POLICY owner_control ON agency_platform.support_access_log TO aoc_agency_owner USING(true) WITH CHECK(true);

CREATE FUNCTION agency_platform.audit_support_grant() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
  IF TG_OP='UPDATE' AND (OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL
     OR to_jsonb(OLD)-'revoked_at' IS DISTINCT FROM to_jsonb(NEW)-'revoked_at') THEN
    RAISE EXCEPTION 'Issue a new approval for a changed grant';
  END IF;
  INSERT INTO agency_platform.support_access_log(grant_id,actor_id,agency_id,client_id,action,outcome)
    VALUES(NEW.id,NEW.actor_id,NEW.agency_id,NEW.client_id,NEW.action,
      CASE WHEN TG_OP='INSERT' THEN 'approval_recorded' ELSE 'revoked' END);
  RETURN NEW;
END $$;
CREATE TRIGGER support_grant_history AFTER INSERT OR UPDATE ON agency_platform.support_grants
  FOR EACH ROW EXECUTE FUNCTION agency_platform.audit_support_grant();

-- Only sanitized workspace status is available, even to a valid support grant.
CREATE FUNCTION agency_platform.support_workspace_status(actor text, requested uuid, agency bigint, client bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE actor_key bigint; result jsonb;
BEGIN
  SELECT id INTO STRICT actor_key FROM public.portal_users WHERE external_id=actor;
  SELECT jsonb_build_object('portalEnabled',c.portal_enabled) INTO result
  FROM agency_platform.support_grants g
  JOIN public.portal_admins admin ON admin.user_id=g.actor_id AND admin.is_active
  JOIN agency_platform.agencies a ON a.id=g.agency_id AND a.is_active
  JOIN agency_platform.backfill_state s ON s.id=1 AND s.active
  JOIN agency_platform.memberships m ON m.agency_id=a.id AND m.user_id=g.agency_approver AND m.is_active AND m.role='agency_admin'
  JOIN public.portal_memberships p ON p.client_id=g.client_id AND p.user_id=g.client_approver AND p.is_active AND p.role='client_admin'
  JOIN agency_platform.request_workspaces((SELECT external_id FROM public.portal_users WHERE id=g.client_approver)) w
    ON w.agency_id=a.id AND w.client_id=g.client_id AND w.access_level='manage'
  JOIN public.portal_clients c ON c.id=g.client_id
  WHERE g.id=requested AND g.actor_id=actor_key AND g.agency_id=agency AND g.client_id=client
    AND g.action='support.workspace.status.read' AND g.revoked_at IS NULL
    AND g.approved_at<=statement_timestamp() AND g.expires_at>clock_timestamp();
  INSERT INTO agency_platform.support_access_log(grant_id,actor_id,agency_id,client_id,action,outcome)
    VALUES(requested,actor_key,agency,client,'support.workspace.status.read',CASE WHEN result IS NULL THEN 'denied' ELSE 'exercised' END);
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION agency_platform.request_agency(text,bigint),agency_platform.request_workspaces(text),agency_platform.legacy_admin_scope_safe(),
  agency_platform.support_workspace_status(text,uuid,bigint,bigint),agency_platform.audit_support_grant() FROM PUBLIC;
