-- No automatic adoption, invitations, member promotion or external rollout.
CREATE TABLE agency_platform.agency_governance (
 agency_id bigint PRIMARY KEY REFERENCES agency_platform.agencies(id),
 owner_id bigint NOT NULL,
 enabled boolean NOT NULL DEFAULT false,
 revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0),
 support_name text NOT NULL DEFAULT '' CHECK(length(support_name)<=120),
 support_email text NOT NULL DEFAULT '' CHECK(length(support_email)<=200),
 timezone text NOT NULL DEFAULT 'UTC' CHECK(length(timezone)<=100),
 FOREIGN KEY(agency_id,owner_id) REFERENCES agency_platform.memberships(agency_id,user_id)
);
CREATE TABLE agency_platform.agency_admin_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 operation uuid UNIQUE,
 agency_id bigint NOT NULL REFERENCES agency_platform.agencies(id),
 client_id bigint,
 actor_id bigint NOT NULL REFERENCES public.portal_users(id),
 action text NOT NULL,
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 3 AND 200),
 details jsonb NOT NULL DEFAULT '{}',
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(agency_id,client_id) REFERENCES agency_platform.client_ownership(agency_id,client_id)
);
CREATE TABLE agency_platform.agency_invitations (
 id uuid PRIMARY KEY,
 agency_id bigint NOT NULL REFERENCES agency_platform.agencies(id),
 recipient bigint NOT NULL REFERENCES public.portal_users(id),
 inviter bigint NOT NULL REFERENCES public.portal_users(id),
 role text NOT NULL CHECK(role IN ('agency_admin','staff','client_user')),
 client_id bigint,
 client_role text CHECK(client_role IN ('client_viewer','member','client_admin')),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','revoked')),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(agency_id,client_id) REFERENCES agency_platform.client_ownership(agency_id,client_id),
 CHECK((role='client_user' AND client_id IS NOT NULL AND client_role IS NOT NULL)
 OR (role IN ('agency_admin','staff') AND client_id IS NULL AND client_role IS NULL)),
 CHECK(recipient<>inviter)
);
CREATE UNIQUE INDEX agency_pending_invitation ON agency_platform.agency_invitations(agency_id,recipient) WHERE status='pending';
ALTER TABLE agency_platform.agency_governance ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_platform.agency_governance FORCE ROW LEVEL SECURITY;
ALTER TABLE agency_platform.agency_admin_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_platform.agency_admin_audit FORCE ROW LEVEL SECURITY;
ALTER TABLE agency_platform.agency_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_platform.agency_invitations FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_control ON agency_platform.agency_governance TO aoc_agency_owner USING(true) WITH CHECK(true);
CREATE POLICY owner_control ON agency_platform.agency_admin_audit TO aoc_agency_owner USING(true) WITH CHECK(true);
CREATE POLICY owner_control ON agency_platform.agency_invitations TO aoc_agency_owner USING(true) WITH CHECK(true);

-- An operational workspace always has one active, non-Internal owner. Stage 12
-- accountability records without explicit governance adoption remain unchanged.
CREATE FUNCTION agency_platform.check_agency_owner() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF TG_TABLE_NAME='agency_governance' AND TG_OP='DELETE' THEN
  RAISE EXCEPTION 'Transfer ownership instead of removing it' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM agency_platform.agency_governance g
  LEFT JOIN agency_platform.memberships m ON (m.agency_id,m.user_id)=(g.agency_id,g.owner_id)
  LEFT JOIN agency_platform.agency_owners o ON o.agency_id=g.agency_id
  WHERE m.user_id IS NULL OR NOT m.is_active OR m.role<>'agency_admin' OR o.user_id IS DISTINCT FROM g.owner_id
  OR EXISTS(SELECT 1 FROM public.portal_internal_users i WHERE i.user_id=g.owner_id)) THEN
  RAISE EXCEPTION 'An active agency owner is required' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER agency_owner_required AFTER INSERT OR UPDATE OR DELETE ON agency_platform.agency_governance
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION agency_platform.check_agency_owner();
CREATE CONSTRAINT TRIGGER agency_owner_membership AFTER UPDATE OR DELETE ON agency_platform.memberships
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION agency_platform.check_agency_owner();
CREATE CONSTRAINT TRIGGER agency_owner_display AFTER UPDATE OR DELETE ON agency_platform.agency_owners
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION agency_platform.check_agency_owner();
CREATE CONSTRAINT TRIGGER agency_owner_identity AFTER INSERT OR UPDATE ON public.portal_internal_users
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION agency_platform.check_agency_owner();

CREATE FUNCTION agency_platform.admin_choices(actor text,session_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE person bigint;
BEGIN
 person:=agency_platform.support_actor(actor,session_key);
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',a.id::text,'slug',a.slug,'name',a.display_name,'role',m.role) ORDER BY a.display_name)
 FROM agency_platform.agencies a JOIN agency_platform.memberships m ON m.agency_id=a.id AND m.user_id=person AND m.is_active
 JOIN agency_platform.agency_governance g ON g.agency_id=a.id AND g.enabled
 WHERE a.is_active AND m.role IN ('agency_admin','staff')),'[]'::jsonb);
END $$;
CREATE FUNCTION agency_platform.agency_admin_actor(actor text,session_key text,target bigint)
RETURNS TABLE(person bigint,role text,is_owner boolean,revision bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 PERFORM agency_platform.support_actor(actor,session_key);
 RETURN QUERY SELECT u.id,m.role,g.owner_id=u.id,g.revision
 FROM public.portal_users u JOIN agency_platform.memberships m ON m.user_id=u.id AND m.agency_id=target AND m.is_active
 JOIN agency_platform.request_agency(actor,target) allowed ON allowed.actor_id=u.id
 JOIN agency_platform.agencies a ON a.id=target AND a.is_active
 JOIN agency_platform.agency_governance g ON g.agency_id=a.id AND g.enabled
 WHERE u.external_id=actor AND m.role IN ('agency_admin','staff') FOR SHARE OF u,m,a,g;
 IF NOT FOUND THEN RAISE EXCEPTION 'Agency access denied' USING ERRCODE='42501'; END IF;
END $$;
CREATE FUNCTION agency_platform.agency_visible_clients(actor text,session_key text,target bigint)
RETURNS SETOF bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE p record;
BEGIN
 SELECT * INTO STRICT p FROM agency_platform.agency_admin_actor(actor,session_key,target);
 RETURN QUERY SELECT o.client_id FROM agency_platform.client_ownership o JOIN public.portal_clients c ON c.id=o.client_id
 WHERE o.agency_id=target AND (p.role='agency_admin' OR EXISTS(
 SELECT 1 FROM agency_platform.client_access g JOIN public.portal_memberships m ON (m.client_id,m.user_id)=(g.client_id,g.user_id)
 WHERE g.agency_id=target AND g.client_id=c.id AND g.user_id=p.person AND g.is_active AND m.is_active));
END $$;

CREATE FUNCTION agency_platform.agency_admin_view(actor text,session_key text,target bigint,search text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE p record; visible bigint[]; result jsonb;
BEGIN
 SELECT * INTO STRICT p FROM agency_platform.agency_admin_actor(actor,session_key,target);
 IF search IS NULL OR length(search)>100 THEN RAISE EXCEPTION 'Invalid search' USING ERRCODE='22023'; END IF;
 SELECT coalesce(array_agg(id),'{}'::bigint[]) INTO visible FROM agency_platform.agency_visible_clients(actor,session_key,target) id;
 SELECT jsonb_build_object('agency',jsonb_build_object('id',a.id::text,'slug',a.slug,'name',a.display_name),
 'actor',jsonb_build_object('id',p.person::text,'name',u.display_name,'role',p.role,'isOwner',p.is_owner),
 'revision',g.revision::text,'settings',jsonb_build_object('supportName',g.support_name,'supportEmail',g.support_email,'timezone',g.timezone),
 'clients',coalesce((SELECT jsonb_agg(to_jsonb(rows) ORDER BY rows.name) FROM (
 SELECT c.id::text id,c.slug,c.display_name name,c.portal_enabled AS "portalEnabled",c.ai_enabled AS "aiEnabled",
 c.hubstaff_project_url AS "hubstaffProjectUrl",c.approved_website_url AS "approvedWebsiteUrl",
 (SELECT count(*) FROM public.portal_memberships m WHERE m.client_id=c.id AND m.is_active)::integer AS "memberCount"
 FROM public.portal_clients c WHERE c.id=ANY(visible) AND strpos(lower(c.display_name||' '||c.slug),lower(search))>0
 ORDER BY c.display_name LIMIT 100) rows),'[]'::jsonb),
 'clientCount',(SELECT count(*) FROM public.portal_clients c WHERE c.id=ANY(visible) AND strpos(lower(c.display_name||' '||c.slug),lower(search))>0),
 'members',coalesce((SELECT jsonb_agg(to_jsonb(rows) ORDER BY rows.name) FROM (
 SELECT m.user_id::text id,member.display_name name,member.external_id account,m.role,m.is_active active,m.user_id=g.owner_id AS "isOwner"
 FROM agency_platform.memberships m JOIN public.portal_users member ON member.id=m.user_id
 WHERE m.agency_id=target AND (p.role='agency_admin' OR m.user_id=p.person) ORDER BY member.display_name LIMIT 100) rows),'[]'::jsonb),
 'grants',coalesce((SELECT jsonb_agg(jsonb_build_object('clientId',x.client_id::text,'userId',x.user_id::text,'level',x.access_level,'active',x.is_active,'role',m.role))
 FROM agency_platform.client_access x JOIN public.portal_memberships m ON (m.client_id,m.user_id)=(x.client_id,x.user_id)
 WHERE x.agency_id=target AND x.client_id=ANY(visible) AND (p.role='agency_admin' OR x.user_id=p.person)),'[]'::jsonb),
 'invitations',CASE WHEN p.role='agency_admin' THEN coalesce((SELECT jsonb_agg(jsonb_build_object('id',i.id,'role',i.role,'clientId',i.client_id::text,'status',i.status,'expiresAt',i.expires_at))
 FROM agency_platform.agency_invitations i WHERE i.agency_id=target AND i.status='pending'),'[]'::jsonb) ELSE '[]'::jsonb END,
 'usage',jsonb_build_object('period',to_char(now() AT TIME ZONE 'UTC','YYYY-MM'),
 'requests',(SELECT count(*) FROM public.portal_ai_usage_events e WHERE e.client_id=ANY(visible) AND e.action='client_ai.reply'
 AND e.started_at>=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AND e.started_at<(date_trunc('month',now() AT TIME ZONE 'UTC')+interval '1 month') AT TIME ZONE 'UTC'),
 'tokens',(SELECT sum(e.total_tokens) FROM public.portal_ai_usage_events e WHERE e.client_id=ANY(visible) AND e.action='client_ai.reply'
 AND e.started_at>=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AND e.started_at<(date_trunc('month',now() AT TIME ZONE 'UTC')+interval '1 month') AT TIME ZONE 'UTC'),
 'costs',CASE WHEN p.is_owner THEN (SELECT jsonb_build_object('usd',sum(e.amount_usd),'unknown',count(*) FILTER(WHERE e.amount_usd IS NULL)) FROM public.portal_ai_cost_events e
 WHERE e.client_id=ANY(visible) AND e.occurred_at>=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AND e.occurred_at<(date_trunc('month',now() AT TIME ZONE 'UTC')+interval '1 month') AT TIME ZONE 'UTC') ELSE NULL END),
 'sources',coalesce((SELECT jsonb_agg(jsonb_build_object('scope',CASE WHEN v.client_id IS NULL THEN 'agency' ELSE 'client' END,'clientId',v.client_id::text,
 'enabled',pub.enabled,'checkedAt',prepared.checked_at,'current',pub.enabled AND prepared.failure_code IS NULL AND prepared.checked_at>now()-interval '15 minutes'
 AND EXISTS(SELECT 1 FROM public.portal_admins publisher WHERE publisher.user_id=v.owner_id AND publisher.is_active)
 AND v.publication=agency_platform.source_publication_config(pub) AND v.connection=agency_platform.source_connection_config(conn)
 AND v.binding=prepared.binding AND v.corpus_revision=prepared.sync_info->>'corpusRevision'))
 FROM agency_platform.source_revision_approvals v JOIN public.portal_source_publications pub ON (pub.owner_id,pub.audience)=(v.owner_id,v.audience)
 JOIN public.portal_prepared_source_indexes prepared ON prepared.owner_id=v.owner_id JOIN public.portal_drive_source_connections conn ON conn.owner_id=v.owner_id
 WHERE v.agency_id=target AND (v.client_id IS NULL AND p.role='agency_admin' OR v.client_id=ANY(visible))),'[]'::jsonb),
 'connections',coalesce((SELECT jsonb_agg(jsonb_build_object('service',b.service,'clientId',b.client_id::text)) FROM agency_platform.connection_bindings b
 WHERE b.agency_id=target AND (p.role='agency_admin' OR b.client_id=ANY(visible))),'[]'::jsonb),
 'audit',coalesce((SELECT jsonb_agg(to_jsonb(rows) ORDER BY rows."occurredAt" DESC) FROM (
 SELECT * FROM (
 SELECT 'agency-'||l.id::text id,l.action,l.reason,l.client_id::text AS "clientId",l.occurred_at AS "occurredAt" FROM agency_platform.agency_admin_audit l
 WHERE l.agency_id=target AND (p.role='agency_admin' OR l.client_id=ANY(visible))
 UNION ALL SELECT 'client-'||e.id::text,e.action,'Recorded client operation',e.client_id::text,e.occurred_at
 FROM public.portal_audit_events e WHERE e.client_id=ANY(visible) AND e.audience IN ('client','aoc_admin')
 ) events ORDER BY "occurredAt" DESC LIMIT 100) rows),'[]'::jsonb)) INTO result
 FROM agency_platform.agencies a JOIN agency_platform.agency_governance g ON g.agency_id=a.id JOIN public.portal_users u ON u.id=p.person WHERE a.id=target;
 RETURN result;
END $$;

CREATE FUNCTION agency_platform.agency_admin_change(actor text,session_key text,target bigint,command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE p record; g agency_platform.agency_governance%ROWTYPE; previous agency_platform.agency_admin_audit%ROWTYPE;
 action text:=command->>'action'; reason text:=trim(command->>'reason'); op uuid:=(command->>'operation')::uuid;
 client bigint; member bigint; target_role text; target_active boolean; current_member agency_platform.memberships%ROWTYPE;
 result jsonb; invite agency_platform.agency_invitations%ROWTYPE; project text;
BEGIN
 -- Lock order: serialize a workspace before taking role/owner/assignment locks.
 PERFORM pg_advisory_xact_lock(hashtextextended('agency-admin:'||target,13));
 SELECT * INTO STRICT p FROM agency_platform.agency_admin_actor(actor,session_key,target);
 IF p.role<>'agency_admin' THEN RAISE EXCEPTION 'Agency management denied' USING ERRCODE='42501'; END IF;
 IF op IS NULL OR reason IS NULL OR length(reason) NOT BETWEEN 3 AND 200 OR action IS NULL THEN RAISE EXCEPTION 'Invalid command' USING ERRCODE='22023'; END IF;
 SELECT * INTO previous FROM agency_platform.agency_admin_audit WHERE operation=op;
 IF FOUND THEN
  IF previous.agency_id<>target OR previous.actor_id<>p.person OR previous.details->'command' IS DISTINCT FROM command THEN
   RAISE EXCEPTION 'Operation conflict' USING ERRCODE='40001'; END IF;
  RETURN previous.details->'result';
 END IF;
 SELECT * INTO STRICT g FROM agency_platform.agency_governance WHERE agency_id=target FOR UPDATE;
 IF g.revision::text IS DISTINCT FROM command->>'revision' THEN RAISE EXCEPTION 'Workspace changed' USING ERRCODE='40001'; END IF;
 IF action IN ('settings.update','owner.transfer') AND NOT p.is_owner THEN RAISE EXCEPTION 'Owner access required' USING ERRCODE='42501'; END IF;
 IF action='client.create' THEN
  IF coalesce(command->>'slug','')!~'^[a-z0-9][a-z0-9._-]{2,49}$' OR length(trim(coalesce(command->>'name',''))) NOT BETWEEN 1 AND 120 THEN
   RAISE EXCEPTION 'Invalid client' USING ERRCODE='22023'; END IF;
  INSERT INTO public.portal_clients(slug,display_name,portal_enabled,ai_enabled) VALUES(command->>'slug',trim(command->>'name'),true,false) RETURNING id INTO client;
  INSERT INTO agency_platform.client_ownership(agency_id,client_id) VALUES(target,client);
  -- Refresh the Stage 04 classification after ownership is established.
  UPDATE public.portal_clients SET updated_at=now() WHERE id=client;
 ELSIF action='client.update' THEN
  client:=(command->>'clientId')::bigint;
  PERFORM 1 FROM agency_platform.client_ownership o WHERE o.client_id=client AND o.agency_id=target FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Client unavailable' USING ERRCODE='42501'; END IF;
  IF length(trim(coalesce(command->>'name',''))) NOT BETWEEN 1 AND 120 OR jsonb_typeof(command->'portalEnabled') IS DISTINCT FROM 'boolean'
  OR jsonb_typeof(command->'aiEnabled') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Invalid client settings' USING ERRCODE='22023'; END IF;
  project:=nullif(command->>'hubstaffProjectUrl','');
  -- A project cannot be rebound from another client, even in the same agency.
  IF project IS NOT NULL THEN
   PERFORM pg_advisory_xact_lock(hashtextextended('hubstaff-project:'||project,13));
   IF EXISTS(SELECT 1 FROM public.portal_clients c WHERE c.id<>client AND c.hubstaff_project_url=project) THEN
    RAISE EXCEPTION 'Project mapping unavailable' USING ERRCODE='40001'; END IF;
  END IF;
  UPDATE public.portal_clients SET display_name=trim(command->>'name'),portal_enabled=(command->>'portalEnabled')::boolean,ai_enabled=(command->>'aiEnabled')::boolean,
   approved_website_url=nullif(command->>'approvedWebsiteUrl',''),hubstaff_tracking_project_id=CASE WHEN hubstaff_project_url IS NOT DISTINCT FROM project THEN hubstaff_tracking_project_id ELSE NULL END,
   hubstaff_project_url=project,updated_at=now() WHERE id=client;
  UPDATE agency_platform.job_runs SET token=NULL,lease_until=NULL,failure_code='cancelled' WHERE agency_id=target AND client_id=client;
 ELSIF action='client.access' THEN
  client:=(command->>'clientId')::bigint;member:=(command->>'userId')::bigint;target_role:=command->>'clientRole';
  PERFORM 1 FROM agency_platform.client_ownership o WHERE o.client_id=client AND o.agency_id=target FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Client unavailable' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM agency_platform.memberships m WHERE m.agency_id=target AND m.user_id=member AND m.is_active FOR SHARE;
  IF NOT FOUND OR target_role IS NULL OR target_role NOT IN ('client_viewer','member','client_admin') OR jsonb_typeof(command->'active') IS DISTINCT FROM 'boolean'
   OR EXISTS(SELECT 1 FROM public.portal_internal_users i WHERE i.user_id=member) THEN RAISE EXCEPTION 'Assignment unavailable' USING ERRCODE='42501'; END IF;
  IF EXISTS(SELECT 1 FROM public.portal_memberships m WHERE m.client_id=client AND m.user_id=member AND m.role='client_admin' AND m.is_active)
   AND (target_role<>'client_admin' OR NOT (command->>'active')::boolean)
   AND NOT EXISTS(SELECT 1 FROM public.portal_memberships m WHERE m.client_id=client AND m.user_id<>member AND m.role='client_admin' AND m.is_active) THEN
   RAISE EXCEPTION 'Assign another client administrator first' USING ERRCODE='42501'; END IF;
  INSERT INTO public.portal_memberships(client_id,user_id,role,is_active) VALUES(client,member,target_role,(command->>'active')::boolean)
   ON CONFLICT(client_id,user_id) DO UPDATE SET role=EXCLUDED.role,is_active=EXCLUDED.is_active;
  INSERT INTO agency_platform.client_access(agency_id,client_id,user_id,access_level,is_active)
   VALUES(target,client,member,CASE target_role WHEN 'client_viewer' THEN 'read' WHEN 'client_admin' THEN 'manage' ELSE 'contribute' END,(command->>'active')::boolean)
   ON CONFLICT(agency_id,client_id,user_id) DO UPDATE SET access_level=EXCLUDED.access_level,is_active=EXCLUDED.is_active;
 ELSIF action='member.update' THEN
  member:=(command->>'userId')::bigint;target_role:=command->>'role';
  SELECT * INTO current_member FROM agency_platform.memberships m WHERE m.agency_id=target AND m.user_id=member FOR UPDATE;
  IF NOT FOUND OR current_member.role NOT IN ('agency_admin','staff') OR target_role IS NULL OR target_role NOT IN ('agency_admin','staff')
   OR jsonb_typeof(command->'active') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Member unavailable' USING ERRCODE='42501'; END IF;
  target_active:=(command->>'active')::boolean;
  IF member=g.owner_id OR (NOT p.is_owner AND (current_member.role<>'staff' OR target_role<>'staff')) THEN
   RAISE EXCEPTION 'Owner or higher role is protected' USING ERRCODE='42501'; END IF;
  UPDATE agency_platform.memberships SET role=target_role,is_active=target_active WHERE agency_id=target AND user_id=member;
  IF NOT target_active THEN
   UPDATE agency_platform.client_access SET is_active=false WHERE agency_id=target AND user_id=member;
   UPDATE public.portal_memberships SET is_active=false WHERE user_id=member AND client_id IN (SELECT o.client_id FROM agency_platform.client_ownership o WHERE o.agency_id=target);
   UPDATE agency_platform.support_grants SET revoked_at=clock_timestamp() WHERE agency_id=target AND revoked_at IS NULL AND member IN (actor_id,agency_approver,client_approver);
  END IF;
 ELSIF action='invite.create' THEN
  target_role:=command->>'role';
  IF target_role IS NULL OR target_role NOT IN ('agency_admin','staff','client_user') OR (target_role='agency_admin' AND NOT p.is_owner) THEN
   RAISE EXCEPTION 'Invitation role denied' USING ERRCODE='42501'; END IF;
  SELECT u.id INTO member FROM public.portal_users u WHERE u.external_id=command->>'account'
   AND NOT EXISTS(SELECT 1 FROM public.portal_internal_users i WHERE i.user_id=u.id) FOR SHARE;
  IF member IS NULL OR member=p.person OR EXISTS(SELECT 1 FROM agency_platform.memberships m WHERE m.agency_id=target AND m.user_id=member AND m.is_active) THEN
   RAISE EXCEPTION 'Invitation unavailable' USING ERRCODE='22023'; END IF;
  IF target_role='client_user' THEN
   client:=(command->>'clientId')::bigint;
   PERFORM 1 FROM agency_platform.client_ownership o WHERE o.client_id=client AND o.agency_id=target FOR SHARE;
   IF NOT FOUND OR coalesce(command->>'clientRole','') NOT IN ('client_viewer','member','client_admin') THEN RAISE EXCEPTION 'Client unavailable' USING ERRCODE='42501'; END IF;
  END IF;
  -- Expired invitations cannot occupy the unique pending slot forever.
  UPDATE agency_platform.agency_invitations SET status='revoked' WHERE agency_id=target AND recipient=member AND status='pending' AND expires_at<=clock_timestamp();
  INSERT INTO agency_platform.agency_invitations(id,agency_id,recipient,inviter,role,client_id,client_role)
   VALUES(op,target,member,p.person,target_role,client,CASE WHEN target_role='client_user' THEN command->>'clientRole' END);
 ELSIF action='invite.revoke' THEN
  SELECT * INTO invite FROM agency_platform.agency_invitations WHERE id=(command->>'invitationId')::uuid AND agency_id=target FOR UPDATE;
  IF NOT FOUND OR invite.status<>'pending' OR (invite.role='agency_admin' AND NOT p.is_owner) THEN RAISE EXCEPTION 'Invitation unavailable' USING ERRCODE='42501'; END IF;
  UPDATE agency_platform.agency_invitations SET status='revoked' WHERE id=invite.id;
 ELSIF action='settings.update' THEN
  IF length(coalesce(command->>'supportName',''))>120 OR length(coalesce(command->>'supportEmail',''))>200
   OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names z WHERE z.name=command->>'timezone') THEN RAISE EXCEPTION 'Invalid settings' USING ERRCODE='22023'; END IF;
  UPDATE agency_platform.agency_governance SET support_name=command->>'supportName',support_email=command->>'supportEmail',timezone=command->>'timezone' WHERE agency_id=target;
 ELSIF action='owner.transfer' THEN
  member:=(command->>'userId')::bigint;
  IF command->>'confirmation' IS DISTINCT FROM (SELECT slug FROM agency_platform.agencies WHERE id=target) OR member=g.owner_id THEN RAISE EXCEPTION 'Invalid ownership confirmation' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM agency_platform.memberships m WHERE m.agency_id=target AND m.user_id=member AND m.role='agency_admin' AND m.is_active FOR SHARE;
  IF NOT FOUND OR EXISTS(SELECT 1 FROM public.portal_internal_users i WHERE i.user_id=member) THEN RAISE EXCEPTION 'Owner unavailable' USING ERRCODE='42501'; END IF;
  UPDATE agency_platform.agency_governance SET owner_id=member WHERE agency_id=target;
  UPDATE agency_platform.agency_owners SET user_id=member,assigned_by=p.person,assigned_at=now() WHERE agency_id=target;
 ELSE RAISE EXCEPTION 'Unsupported agency action' USING ERRCODE='22023';
 END IF;
 UPDATE agency_platform.agency_governance SET revision=revision+1 WHERE agency_id=target RETURNING revision INTO g.revision;
 result:=jsonb_build_object('saved',true,'revision',g.revision::text,'clientId',client::text);
 INSERT INTO agency_platform.agency_admin_audit(operation,agency_id,client_id,actor_id,action,reason,details)
 VALUES(op,target,client,p.person,action,reason,jsonb_build_object('command',command,'result',result));
 RETURN result;
END $$;

CREATE FUNCTION agency_platform.agency_my_invitations(actor text,session_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE person bigint;
BEGIN
 person:=agency_platform.support_actor(actor,session_key);
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',i.id,'agency',a.display_name,'agencySlug',a.slug,'role',i.role,'clientRole',i.client_role,'expiresAt',i.expires_at))
 FROM agency_platform.agency_invitations i JOIN agency_platform.agencies a ON a.id=i.agency_id AND a.is_active
 JOIN agency_platform.agency_governance g ON g.agency_id=a.id AND g.enabled
 WHERE i.recipient=person AND i.status='pending' AND i.expires_at>clock_timestamp()),'[]'::jsonb);
END $$;
CREATE FUNCTION agency_platform.agency_accept_invitation(actor text,session_key text,requested uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE person bigint; invite agency_platform.agency_invitations%ROWTYPE; author record;
BEGIN
 person:=agency_platform.support_actor(actor,session_key);
 SELECT * INTO invite FROM agency_platform.agency_invitations WHERE id=requested AND recipient=person;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invitation unavailable' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('agency-admin:'||invite.agency_id,13));
 SELECT * INTO STRICT invite FROM agency_platform.agency_invitations WHERE id=requested FOR UPDATE;
 IF invite.status<>'pending' OR invite.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'Invitation unavailable' USING ERRCODE='42501'; END IF;
 SELECT m.role,g.owner_id INTO author FROM agency_platform.memberships m JOIN agency_platform.agencies a ON a.id=m.agency_id AND a.is_active
 JOIN agency_platform.agency_governance g ON g.agency_id=a.id AND g.enabled
 WHERE m.agency_id=invite.agency_id AND m.user_id=invite.inviter AND m.is_active FOR SHARE OF m,a,g;
 IF NOT FOUND OR author.role<>'agency_admin' OR (invite.role='agency_admin' AND author.owner_id<>invite.inviter)
 OR EXISTS(SELECT 1 FROM public.portal_internal_users i WHERE i.user_id=invite.inviter) THEN RAISE EXCEPTION 'Inviter authority changed' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM agency_platform.memberships m WHERE m.agency_id=invite.agency_id AND m.user_id=person AND m.is_active) THEN
  RAISE EXCEPTION 'Membership already active' USING ERRCODE='40001'; END IF;
 INSERT INTO agency_platform.memberships(agency_id,user_id,role,is_active) VALUES(invite.agency_id,person,invite.role,true)
  ON CONFLICT(agency_id,user_id) DO UPDATE SET role=EXCLUDED.role,is_active=true;
 IF invite.client_id IS NOT NULL THEN
  PERFORM 1 FROM agency_platform.client_ownership o WHERE o.agency_id=invite.agency_id AND o.client_id=invite.client_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Client unavailable' USING ERRCODE='42501'; END IF;
  INSERT INTO public.portal_memberships(client_id,user_id,role,is_active) VALUES(invite.client_id,person,invite.client_role,true)
   ON CONFLICT(client_id,user_id) DO UPDATE SET role=EXCLUDED.role,is_active=true;
  INSERT INTO agency_platform.client_access(agency_id,client_id,user_id,access_level,is_active)
   VALUES(invite.agency_id,invite.client_id,person,CASE invite.client_role WHEN 'client_admin' THEN 'manage' WHEN 'member' THEN 'contribute' ELSE 'read' END,true)
   ON CONFLICT(agency_id,client_id,user_id) DO UPDATE SET access_level=EXCLUDED.access_level,is_active=true;
 END IF;
 UPDATE agency_platform.agency_invitations SET status='accepted' WHERE id=requested;
 UPDATE agency_platform.agency_governance SET revision=revision+1 WHERE agency_id=invite.agency_id;
 INSERT INTO agency_platform.agency_admin_audit(agency_id,client_id,actor_id,action,reason) VALUES(invite.agency_id,invite.client_id,person,'invite.accept','Recipient explicitly accepted local invitation');
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA agency_platform FROM PUBLIC;
