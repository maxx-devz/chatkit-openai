-- Operator-applied, additive. No legacy administrator is promoted.
CREATE TABLE agency_platform.platform_memberships (
 user_id bigint PRIMARY KEY REFERENCES public.portal_users(id),
 role text NOT NULL CHECK(role IN ('owner','operator')),
 is_active boolean NOT NULL DEFAULT true,
 assignment_reason text NOT NULL CHECK(length(trim(assignment_reason)) BETWEEN 3 AND 200),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE agency_platform.agency_owners (
 agency_id bigint PRIMARY KEY REFERENCES agency_platform.agencies(id),
 user_id bigint NOT NULL REFERENCES public.portal_users(id),
 assigned_by bigint NOT NULL REFERENCES public.portal_users(id),
 assigned_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE agency_platform.platform_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 operation uuid UNIQUE,
 actor_id bigint REFERENCES public.portal_users(id),
 agency_id bigint REFERENCES agency_platform.agencies(id),
 action text NOT NULL,
 reason text NOT NULL,
 details jsonb NOT NULL DEFAULT '{}',
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE agency_platform.support_requests (
 id uuid PRIMARY KEY,
 actor_id bigint NOT NULL REFERENCES public.portal_users(id),
 agency_id bigint NOT NULL,
 client_id bigint NOT NULL,
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 3 AND 200),
 ticket text NOT NULL CHECK(length(trim(ticket)) BETWEEN 1 AND 100),
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 agency_approver bigint REFERENCES public.portal_users(id),
 client_approver bigint REFERENCES public.portal_users(id),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','denied','revoked')),
 FOREIGN KEY(agency_id,client_id) REFERENCES agency_platform.client_ownership(agency_id,client_id),
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '1 hour'),
 CHECK(actor_id IS DISTINCT FROM agency_approver AND actor_id IS DISTINCT FROM client_approver),
 CHECK(agency_approver IS NULL OR client_approver IS NULL OR agency_approver<>client_approver)
);
ALTER TABLE agency_platform.agencies ADD COLUMN state_version bigint NOT NULL DEFAULT 0;
CREATE FUNCTION agency_platform.agency_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN NEW.state_version:=OLD.state_version+1; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER agency_state_version BEFORE UPDATE ON agency_platform.agencies
 FOR EACH ROW EXECUTE FUNCTION agency_platform.agency_version();

ALTER TABLE agency_platform.platform_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_platform.platform_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE agency_platform.agency_owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_platform.agency_owners FORCE ROW LEVEL SECURITY;
ALTER TABLE agency_platform.platform_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_platform.platform_audit FORCE ROW LEVEL SECURITY;
ALTER TABLE agency_platform.support_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_platform.support_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_control ON agency_platform.platform_memberships TO aoc_agency_owner USING(true) WITH CHECK(true);
CREATE POLICY owner_control ON agency_platform.agency_owners TO aoc_agency_owner USING(true) WITH CHECK(true);
CREATE POLICY owner_control ON agency_platform.platform_audit TO aoc_agency_owner USING(true) WITH CHECK(true);
CREATE POLICY owner_control ON agency_platform.support_requests TO aoc_agency_owner USING(true) WITH CHECK(true);

CREATE FUNCTION agency_platform.platform_assignment_audit() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 INSERT INTO agency_platform.platform_audit(action,reason,details)
 VALUES('platform.assignment',NEW.assignment_reason,jsonb_build_object('userId',NEW.user_id::text,'role',NEW.role,'active',NEW.is_active,'databaseOperator',session_user));
 RETURN NEW;
END $$;
CREATE TRIGGER platform_assignment_history AFTER INSERT OR UPDATE ON agency_platform.platform_memberships
 FOR EACH ROW EXECUTE FUNCTION agency_platform.platform_assignment_audit();

-- All console functions recheck the real Better Auth session and live membership.
-- Headers, selected client, legacy Admin role and request JSON cannot confer it.
CREATE FUNCTION agency_platform.console_actor(actor text,session_key text,write_access boolean)
RETURNS TABLE(user_id bigint,role text,name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 RETURN QUERY SELECT u.id,m.role,u.display_name FROM public.portal_users u
 JOIN public."session" s ON s."userId"=u.external_id AND s.id=session_key AND s."expiresAt">clock_timestamp()
 JOIN agency_platform.platform_memberships m ON m.user_id=u.id AND m.is_active
 WHERE u.external_id=actor AND (NOT write_access OR m.role='owner')
 AND NOT EXISTS(SELECT 1 FROM public.portal_internal_users i WHERE i.user_id=u.id)
 FOR SHARE OF u,s,m;
 IF NOT FOUND THEN RAISE EXCEPTION 'Platform access denied' USING ERRCODE='42501'; END IF;
END $$;

CREATE FUNCTION agency_platform.console_directory(actor text,session_key text,query text,filter text,page integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 PERFORM * FROM agency_platform.console_actor(actor,session_key,false);
 IF length(query)>100 OR filter NOT IN ('all','active','suspended') OR page<0 OR page>100000 THEN
 RAISE EXCEPTION 'Invalid directory filter' USING ERRCODE='22023'; END IF;
 WITH agencies AS (
 SELECT a.id::text AS id,a.slug,a.display_name AS name,a.is_active AS active,a.state_version::text AS version,
   a.created_at AS "createdAt",a.id=s.aoc_agency_id AS "isAoc",
   CASE WHEN u.id IS NULL THEN NULL ELSE jsonb_build_object('name',u.display_name,'account',u.external_id) END AS owner,
   (SELECT count(*) FROM agency_platform.client_ownership o WHERE o.agency_id=a.id)::integer AS "clientCount",
   (SELECT count(*) FROM agency_platform.job_runs j WHERE j.agency_id=a.id AND j.failure_code='job_failed')::integer AS "failedJobs",
   (SELECT count(*) FROM agency_platform.connection_bindings b WHERE b.agency_id=a.id AND
    ((b.service='drive' AND NOT EXISTS(SELECT 1 FROM public.portal_drive_source_connections d WHERE d.owner_id=b.owner_id)) OR
     (b.service='search_console' AND NOT EXISTS(SELECT 1 FROM public.portal_website_insights_google g WHERE g.website_id::text=b.resource AND g.client_id=b.client_id))))::integer AS "disconnectedConnections"
 FROM agency_platform.agencies a CROSS JOIN agency_platform.backfill_state s
 LEFT JOIN agency_platform.agency_owners own ON own.agency_id=a.id LEFT JOIN public.portal_users u ON u.id=own.user_id
 WHERE s.id=1 AND s.active AND (query='' OR strpos(lower(a.display_name||' '||a.slug),lower(query))>0)
 AND (filter='all' OR a.is_active=(filter='active'))
 ) SELECT jsonb_build_object('agencies',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.name,p.id) FROM
 (SELECT * FROM agencies ORDER BY name,id LIMIT 25 OFFSET page*25) p),'[]'::jsonb),
 'total',(SELECT count(*) FROM agencies),'activeCount',(SELECT count(*) FROM agency_platform.agencies WHERE is_active),
 'page',page,'pageSize',25) INTO result;
 RETURN result;
END $$;

-- Cost events may not exist in a pre-credits installation. Only aggregate
-- recorded provider USD; unknown amounts remain unknown, never inferred fees.
CREATE FUNCTION agency_platform.console_costs(actor text,session_key text,targets bigint[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 PERFORM * FROM agency_platform.console_actor(actor,session_key,false);
 IF cardinality(targets)>25 THEN RAISE EXCEPTION 'Invalid cost scope' USING ERRCODE='22023'; END IF;
 IF to_regclass('public.portal_ai_cost_events') IS NULL THEN RETURN '{}'::jsonb; END IF;
 EXECUTE $sql$SELECT coalesce(jsonb_object_agg(id,value),'{}'::jsonb) FROM (
 SELECT a.id::text id,jsonb_build_object('usd',sum(e.amount_usd),'unknown',count(*) FILTER(WHERE e.amount_usd IS NULL),
 'events',count(*),'period',to_char(now() AT TIME ZONE 'UTC','YYYY-MM')) value
 FROM agency_platform.agencies a JOIN agency_platform.client_ownership o ON o.agency_id=a.id
 JOIN public.portal_ai_cost_events e ON e.client_id=o.client_id
 WHERE a.id=ANY($1) AND e.occurred_at>=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
 AND e.occurred_at<(date_trunc('month',now() AT TIME ZONE 'UTC')+interval '1 month') AT TIME ZONE 'UTC'
 GROUP BY a.id) sums$sql$ INTO result USING targets;
 RETURN result;
END $$;

CREATE FUNCTION agency_platform.console_change(actor text,session_key text,command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE person bigint; target agency_platform.agencies%ROWTYPE; owner_key bigint; op uuid;
 prior agency_platform.platform_audit%ROWTYPE; action text; reason text; result jsonb; old_state boolean;
BEGIN
 SELECT user_id INTO STRICT person FROM agency_platform.console_actor(actor,session_key,true);
 action:=command->>'action';reason:=trim(command->>'reason');op:=(command->>'operation')::uuid;
 IF op IS NULL OR action IS NULL OR action NOT IN ('create','suspend','reactivate') OR reason IS NULL OR length(reason) NOT BETWEEN 3 AND 200 THEN
 RAISE EXCEPTION 'Invalid agency action' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('platform-operation:'||op,12));
 SELECT * INTO prior FROM agency_platform.platform_audit WHERE operation=op;
 IF FOUND THEN
   IF prior.actor_id<>person OR prior.action<>'agency.'||action OR prior.details->'command' IS DISTINCT FROM command THEN
    RAISE EXCEPTION 'Operation conflict' USING ERRCODE='40001'; END IF;
   RETURN prior.details->'result';
 END IF;
 IF action='create' THEN
   IF coalesce(command->>'slug','')!~'^[a-z0-9][a-z0-9_-]{1,79}$' OR length(trim(coalesce(command->>'name',''))) NOT BETWEEN 1 AND 160 THEN
    RAISE EXCEPTION 'Invalid agency details' USING ERRCODE='22023'; END IF;
   SELECT u.id INTO owner_key FROM public.portal_users u WHERE u.external_id=command->>'ownerAccount'
    AND NOT EXISTS(SELECT 1 FROM public.portal_internal_users i WHERE i.user_id=u.id) FOR SHARE;
   IF owner_key IS NULL THEN RAISE EXCEPTION 'Owner account unavailable' USING ERRCODE='22023'; END IF;
   INSERT INTO agency_platform.agencies(slug,display_name) VALUES(command->>'slug',trim(command->>'name')) RETURNING * INTO target;
   INSERT INTO agency_platform.agency_owners(agency_id,user_id,assigned_by) VALUES(target.id,owner_key,person);
 ELSE
   SELECT * INTO target FROM agency_platform.agencies a WHERE a.id=(command->>'agencyId')::bigint FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Agency unavailable' USING ERRCODE='22023'; END IF;
   IF target.slug IS DISTINCT FROM command->>'confirmation' OR target.state_version::text IS DISTINCT FROM command->>'version'
     OR target.is_active=(action='reactivate') THEN RAISE EXCEPTION 'Agency state changed' USING ERRCODE='40001'; END IF;
   old_state:=target.is_active;
   UPDATE agency_platform.agencies SET is_active=(action='reactivate') WHERE id=target.id RETURNING * INTO target;
   IF action='suspend' THEN
     UPDATE agency_platform.job_runs SET token=NULL,lease_until=NULL,failure_code='cancelled' WHERE agency_id=target.id;
     UPDATE agency_platform.connection_bindings SET generation=generation+1 WHERE agency_id=target.id;
     UPDATE agency_platform.support_grants SET revoked_at=clock_timestamp() WHERE agency_id=target.id AND revoked_at IS NULL;
     UPDATE agency_platform.support_requests SET status='revoked' WHERE agency_id=target.id AND status IN ('pending','approved');
   END IF;
 END IF;
 result:=jsonb_build_object('id',target.id::text,'slug',target.slug,'active',target.is_active,'version',target.state_version::text);
 INSERT INTO agency_platform.platform_audit(operation,actor_id,agency_id,action,reason,details)
 VALUES(op,person,target.id,'agency.'||action,reason,jsonb_build_object('command',command,'result',result,'previousActive',old_state));
 RETURN result;
END $$;

-- Explicit AOC-delivery role; not a platform-console privilege. The all-estate
-- legacy Admin guard remains unchanged. No foreign client metadata is returned.
CREATE FUNCTION agency_platform.aoc_delivery(actor text,session_key text)
RETURNS TABLE(id bigint,slug text,name text,portal_enabled boolean,ai_enabled boolean,hubstaff_project_url text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE person bigint; agency bigint;
BEGIN
 SELECT u.id,s.aoc_agency_id INTO person,agency FROM public.portal_users u
 JOIN public."session" session ON session."userId"=u.external_id AND session.id=session_key AND session."expiresAt">clock_timestamp()
 JOIN public.portal_admins p ON p.user_id=u.id AND p.is_active
 JOIN agency_platform.backfill_state s ON s.id=1 AND s.active
 JOIN agency_platform.agencies a ON a.id=s.aoc_agency_id AND a.is_active
 JOIN agency_platform.memberships m ON m.user_id=u.id AND m.agency_id=a.id AND m.role='agency_admin' AND m.is_active
 WHERE u.external_id=actor AND NOT EXISTS(SELECT 1 FROM public.portal_internal_users i WHERE i.user_id=u.id)
 FOR SHARE OF u,session,p,s,a,m;
 IF person IS NULL THEN RAISE EXCEPTION 'AOC delivery access denied' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT c.id,c.slug,c.display_name,c.portal_enabled,c.ai_enabled,c.hubstaff_project_url
 FROM public.portal_clients c JOIN agency_platform.client_ownership o ON o.client_id=c.id AND o.agency_id=agency ORDER BY c.display_name;
END $$;
CREATE FUNCTION agency_platform.aoc_delivery_update(actor text,session_key text,target bigint,enabled boolean,ai boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE person bigint;
BEGIN
 PERFORM 1 FROM agency_platform.client_ownership o WHERE o.client_id=target FOR SHARE;
 PERFORM 1 FROM public.portal_clients c WHERE c.id=target FOR UPDATE;
 PERFORM 1 FROM agency_platform.aoc_delivery(actor,session_key) c WHERE c.id=target;
 IF NOT FOUND OR enabled IS NULL OR ai IS NULL THEN RAISE EXCEPTION 'AOC client unavailable' USING ERRCODE='42501'; END IF;
 SELECT id INTO STRICT person FROM public.portal_users WHERE external_id=actor;
 UPDATE public.portal_clients SET portal_enabled=enabled,ai_enabled=ai,updated_at=now() WHERE id=target;
 INSERT INTO public.portal_audit_events(audience,client_id,actor_user_id,action,target_type,target_id)
 VALUES('aoc_admin',target,person,'aoc.client.access.update','client',target::text);
END $$;

-- Consent is deliberately AOC-only while Stage 11's external gate stays closed.
CREATE FUNCTION agency_platform.support_actor(actor text,session_key text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE person bigint;
BEGIN
 SELECT u.id INTO person FROM public.portal_users u JOIN public."session" s ON s."userId"=u.external_id
 WHERE u.external_id=actor AND s.id=session_key AND s."expiresAt">clock_timestamp()
 AND NOT EXISTS(SELECT 1 FROM public.portal_internal_users i WHERE i.user_id=u.id) FOR SHARE OF u,s;
 IF person IS NULL THEN RAISE EXCEPTION 'Support access denied' USING ERRCODE='42501'; END IF;
 RETURN person;
END $$;
CREATE FUNCTION agency_platform.support_request(actor text,session_key text,client bigint,reason text,ticket text,request_key uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE person bigint; agency bigint; previous agency_platform.support_requests%ROWTYPE;
BEGIN
 SELECT user_id INTO STRICT person FROM agency_platform.console_actor(actor,session_key,false);
 SELECT o.agency_id INTO agency FROM agency_platform.client_ownership o JOIN agency_platform.agencies a ON a.id=o.agency_id AND a.is_active
 JOIN agency_platform.backfill_state s ON s.id=1 AND s.active AND s.aoc_agency_id=a.id WHERE o.client_id=client FOR SHARE OF o,a,s;
 IF agency IS NULL OR request_key IS NULL THEN RAISE EXCEPTION 'Support target unavailable' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('support-request:'||request_key,12));
 SELECT * INTO previous FROM agency_platform.support_requests WHERE id=request_key;
 IF FOUND THEN
   IF previous.actor_id<>person OR previous.client_id<>client OR previous.reason<>reason OR previous.ticket<>ticket THEN
    RAISE EXCEPTION 'Support request conflict' USING ERRCODE='40001'; END IF;
   RETURN request_key;
 END IF;
 INSERT INTO agency_platform.support_requests(id,actor_id,agency_id,client_id,reason,ticket,expires_at)
 VALUES(request_key,person,agency,client,reason,ticket,now()+interval '30 minutes');
 INSERT INTO agency_platform.platform_audit(actor_id,agency_id,action,reason,details)
 VALUES(person,agency,'support.request',reason,jsonb_build_object('request',request_key,'client',client::text,'ticket',ticket));
 RETURN request_key;
END $$;

CREATE FUNCTION agency_platform.support_requests_list(actor text,session_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE person bigint; result jsonb;
BEGIN
 person:=agency_platform.support_actor(actor,session_key);
 SELECT coalesce(jsonb_agg(to_jsonb(rows) ORDER BY rows."createdAt" DESC),'[]'::jsonb) INTO result FROM (
 SELECT r.id,r.agency_id::text AS "agencyId",r.client_id::text AS "clientId",a.display_name AS agency,c.display_name AS client,
 u.display_name AS requester,r.reason,r.ticket,r.status,r.expires_at AS "expiresAt",r.created_at AS "createdAt",
 r.agency_approver IS NOT NULL AS "agencyApproved",r.client_approver IS NOT NULL AS "clientApproved",
 (SELECT max(l.occurred_at) FROM agency_platform.support_access_log l WHERE l.grant_id=r.id AND l.outcome='exercised') AS "lastUsedAt",
 r.status='approved' AND r.actor_id<>person AND EXISTS(SELECT 1 FROM agency_platform.memberships m WHERE m.agency_id=a.id AND m.user_id=person AND m.is_active AND m.role='agency_admin') AS "canRevokeAgency",
 r.status='approved' AND r.actor_id<>person AND EXISTS(SELECT 1 FROM agency_platform.request_workspaces(actor) w WHERE w.agency_id=a.id AND w.client_id=c.id AND w.access_level='manage' AND w.client_role='client_admin') AS "canRevokeClient",
 r.actor_id=person AS "isRequester",
 r.status='pending' AND r.agency_approver IS NULL AND r.expires_at>clock_timestamp() AND r.actor_id<>person AND r.client_approver IS DISTINCT FROM person AND EXISTS(
  SELECT 1 FROM agency_platform.memberships m WHERE m.agency_id=a.id AND m.user_id=person AND m.is_active AND m.role='agency_admin') AS "canApproveAgency",
 r.status='pending' AND r.client_approver IS NULL AND r.expires_at>clock_timestamp() AND r.actor_id<>person AND r.agency_approver IS DISTINCT FROM person AND EXISTS(
  SELECT 1 FROM agency_platform.request_workspaces(actor) w WHERE w.agency_id=a.id AND w.client_id=c.id AND w.access_level='manage' AND w.client_role='client_admin') AS "canApproveClient"
 FROM agency_platform.support_requests r JOIN agency_platform.agencies a ON a.id=r.agency_id AND a.is_active
 JOIN agency_platform.backfill_state s ON s.id=1 AND s.active AND s.aoc_agency_id=a.id
 JOIN public.portal_clients c ON c.id=r.client_id JOIN public.portal_users u ON u.id=r.actor_id
 WHERE r.actor_id=person AND EXISTS(SELECT 1 FROM agency_platform.platform_memberships p WHERE p.user_id=person AND p.is_active)
 OR (a.id=s.aoc_agency_id AND EXISTS(SELECT 1 FROM agency_platform.memberships m WHERE m.agency_id=a.id AND m.user_id=person AND m.is_active AND m.role='agency_admin'))
 OR EXISTS(SELECT 1 FROM agency_platform.request_workspaces(actor) w WHERE w.agency_id=a.id AND w.client_id=c.id AND w.access_level='manage' AND w.client_role='client_admin')
 ORDER BY r.created_at DESC LIMIT 50) rows;
 RETURN result;
END $$;

CREATE FUNCTION agency_platform.support_decide(actor text,session_key text,request_key uuid,capacity text,decision text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE person bigint; r agency_platform.support_requests%ROWTYPE; agency_ok boolean; client_ok boolean;
BEGIN
 person:=agency_platform.support_actor(actor,session_key);
 SELECT * INTO r FROM agency_platform.support_requests WHERE id=request_key FOR UPDATE;
 IF NOT FOUND OR r.actor_id=person OR decision IS NULL OR capacity IS NULL
 OR (decision='revoke' AND r.status<>'approved') OR (decision<>'revoke' AND (r.status<>'pending' OR r.expires_at<=clock_timestamp()))
 OR decision NOT IN ('approve','deny','revoke') OR capacity NOT IN ('agency','client') THEN RAISE EXCEPTION 'Support consent unavailable' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM agency_platform.agencies a JOIN agency_platform.backfill_state s ON s.id=1 AND s.active AND s.aoc_agency_id=a.id
 WHERE a.id=r.agency_id AND a.is_active FOR SHARE OF a,s;
 IF NOT FOUND THEN RAISE EXCEPTION 'Support consent unavailable' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM agency_platform.memberships m WHERE m.agency_id=r.agency_id FOR SHARE;
 PERFORM 1 FROM public.portal_memberships m WHERE m.client_id=r.client_id FOR SHARE;
 PERFORM 1 FROM agency_platform.client_access m WHERE m.client_id=r.client_id FOR SHARE;
 agency_ok:=EXISTS(SELECT 1 FROM agency_platform.memberships m WHERE m.agency_id=r.agency_id AND m.user_id=person AND m.role='agency_admin' AND m.is_active);
 client_ok:=EXISTS(SELECT 1 FROM agency_platform.request_workspaces(actor) w WHERE w.agency_id=r.agency_id AND w.client_id=r.client_id AND w.client_role='client_admin' AND w.access_level='manage');
 IF decision='revoke' THEN
  IF (capacity='agency' AND NOT agency_ok) OR (capacity='client' AND NOT client_ok) THEN RAISE EXCEPTION 'Support consent unavailable' USING ERRCODE='42501'; END IF;
  UPDATE agency_platform.support_grants SET revoked_at=clock_timestamp() WHERE id=r.id AND revoked_at IS NULL;
  UPDATE agency_platform.support_requests SET status='revoked' WHERE id=r.id;
  INSERT INTO agency_platform.platform_audit(actor_id,agency_id,action,reason,details)
   VALUES(person,r.agency_id,'support.revoke',r.reason,jsonb_build_object('request',r.id,'capacity',capacity));
  RETURN;
 END IF;
 IF (capacity='agency' AND (NOT agency_ok OR r.client_approver=person OR r.agency_approver IS NOT NULL)) OR (capacity='client' AND (NOT client_ok OR r.agency_approver=person OR r.client_approver IS NOT NULL)) THEN
 RAISE EXCEPTION 'Support consent unavailable' USING ERRCODE='42501'; END IF;
 IF decision='deny' THEN UPDATE agency_platform.support_requests SET status='denied' WHERE id=r.id;
 ELSE
  UPDATE agency_platform.support_requests SET agency_approver=CASE WHEN capacity='agency' THEN person ELSE agency_approver END,
   client_approver=CASE WHEN capacity='client' THEN person ELSE client_approver END WHERE id=r.id RETURNING * INTO r;
  IF r.agency_approver IS NOT NULL AND r.client_approver IS NOT NULL THEN
   -- Consent may be separated in time. Revalidate BOTH live assignments now.
   IF NOT EXISTS(SELECT 1 FROM agency_platform.memberships m WHERE m.agency_id=r.agency_id AND m.user_id=r.agency_approver AND m.role='agency_admin' AND m.is_active)
    OR NOT EXISTS(SELECT 1 FROM agency_platform.request_workspaces((SELECT external_id FROM public.portal_users WHERE id=r.client_approver)) w WHERE w.agency_id=r.agency_id AND w.client_id=r.client_id AND w.client_role='client_admin' AND w.access_level='manage')
    OR NOT EXISTS(SELECT 1 FROM agency_platform.platform_memberships p WHERE p.user_id=r.actor_id AND p.is_active)
    OR EXISTS(SELECT 1 FROM public.portal_internal_users i WHERE i.user_id IN (r.actor_id,r.agency_approver,r.client_approver)) THEN
    RAISE EXCEPTION 'Support approval no longer valid' USING ERRCODE='42501'; END IF;
   INSERT INTO agency_platform.support_grants(id,agency_id,client_id,actor_id,agency_approver,client_approver,reason,ticket,action,expires_at)
   VALUES(r.id,r.agency_id,r.client_id,r.actor_id,r.agency_approver,r.client_approver,r.reason,r.ticket,'support.workspace.status.read',r.expires_at);
   UPDATE agency_platform.support_requests SET status='approved' WHERE id=r.id;
  END IF;
 END IF;
 INSERT INTO agency_platform.platform_audit(actor_id,agency_id,action,reason,details)
 VALUES(person,r.agency_id,'support.'||decision,r.reason,jsonb_build_object('request',r.id,'capacity',capacity));
END $$;

CREATE FUNCTION agency_platform.console_support_targets(actor text,session_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 PERFORM * FROM agency_platform.console_actor(actor,session_key,false);
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id::text,'name',c.display_name) ORDER BY c.display_name)
 FROM public.portal_clients c JOIN agency_platform.client_ownership o ON o.client_id=c.id
 JOIN agency_platform.backfill_state s ON s.id=1 AND s.active AND s.aoc_agency_id=o.agency_id
 JOIN agency_platform.agencies a ON a.id=o.agency_id AND a.is_active),'[]'::jsonb);
END $$;
CREATE FUNCTION agency_platform.console_audit(actor text,session_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 PERFORM * FROM agency_platform.console_actor(actor,session_key,false);
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(rows) ORDER BY rows.id DESC) FROM (
 SELECT l.id::text,a.display_name AS agency,u.display_name AS actor,l.action,l.reason,l.occurred_at AS "occurredAt"
 FROM agency_platform.platform_audit l LEFT JOIN agency_platform.agencies a ON a.id=l.agency_id
 LEFT JOIN public.portal_users u ON u.id=l.actor_id ORDER BY l.id DESC LIMIT 50) rows),'[]'::jsonb);
END $$;

-- Keep Stage 05 grants usable, and permit explicitly assigned platform actors.
CREATE OR REPLACE FUNCTION agency_platform.support_workspace_status(actor text,requested uuid,agency bigint,client bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE person bigint; result jsonb;
BEGIN
 SELECT id INTO STRICT person FROM public.portal_users WHERE external_id=actor;
 SELECT jsonb_build_object('portalEnabled',c.portal_enabled) INTO result
 FROM agency_platform.support_grants g JOIN agency_platform.agencies a ON a.id=g.agency_id AND a.is_active
 JOIN agency_platform.backfill_state s ON s.id=1 AND s.active
 JOIN agency_platform.memberships m ON m.agency_id=a.id AND m.user_id=g.agency_approver AND m.is_active AND m.role='agency_admin'
 JOIN public.portal_memberships p ON p.client_id=g.client_id AND p.user_id=g.client_approver AND p.is_active AND p.role='client_admin'
 JOIN agency_platform.request_workspaces((SELECT external_id FROM public.portal_users WHERE id=g.client_approver)) w
 ON w.agency_id=a.id AND w.client_id=g.client_id AND w.access_level='manage'
 JOIN public.portal_clients c ON c.id=g.client_id
 WHERE g.id=requested AND g.actor_id=person AND g.agency_id=agency AND g.client_id=client
 AND g.action='support.workspace.status.read' AND g.revoked_at IS NULL AND g.approved_at<=statement_timestamp() AND g.expires_at>clock_timestamp()
 AND NOT EXISTS(SELECT 1 FROM public.portal_internal_users i WHERE i.user_id IN (g.actor_id,g.agency_approver,g.client_approver))
 AND (EXISTS(SELECT 1 FROM public.portal_admins p WHERE p.user_id=person AND p.is_active)
 OR EXISTS(SELECT 1 FROM agency_platform.platform_memberships p WHERE p.user_id=person AND p.is_active));
 INSERT INTO agency_platform.support_access_log(grant_id,actor_id,agency_id,client_id,action,outcome)
 VALUES(requested,person,agency,client,'support.workspace.status.read',CASE WHEN result IS NULL THEN 'denied' ELSE 'exercised' END);
 RETURN result;
END $$;
-- No table DML or helper execution is granted to the shared runtime role.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA agency_platform FROM PUBLIC;
