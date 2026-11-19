-- Stage 14 is additive and opt-in at deployment, but an installed policy cannot
-- be disabled with a request header or a runtime configuration switch.
CREATE TABLE agency_platform.account_controls (
 actor text PRIMARY KEY REFERENCES public."user"(id), disabled boolean NOT NULL DEFAULT false,
 reason text NOT NULL CHECK(length(reason) BETWEEN 3 AND 200), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE agency_platform.session_factors (
 session_id text PRIMARY KEY REFERENCES public."session"(id) ON DELETE CASCADE,
 actor text NOT NULL REFERENCES public."user"(id), verified_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 method text NOT NULL CHECK(method IN ('totp','backup'))
);
CREATE TABLE agency_platform.account_security_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor text NOT NULL,
 action text NOT NULL CHECK(action IN ('factor.verified','invitation.issued','invitation.accepted')),
 invitation_id uuid, occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE agency_platform.invitation_links (
 invitation_id uuid PRIMARY KEY REFERENCES agency_platform.agency_invitations(id),
 secret_hash text NOT NULL UNIQUE CHECK(secret_hash ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz NOT NULL, used_at timestamptz
);
ALTER TABLE agency_platform.account_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_platform.account_controls FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_control ON agency_platform.account_controls TO aoc_agency_owner USING(true) WITH CHECK(true);
ALTER TABLE agency_platform.session_factors ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_platform.session_factors FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_control ON agency_platform.session_factors TO aoc_agency_owner USING(true) WITH CHECK(true);
ALTER TABLE agency_platform.account_security_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_platform.account_security_audit FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_control ON agency_platform.account_security_audit TO aoc_agency_owner USING(true) WITH CHECK(true);
ALTER TABLE agency_platform.invitation_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_platform.invitation_links FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_control ON agency_platform.invitation_links TO aoc_agency_owner USING(true) WITH CHECK(true);

CREATE FUNCTION agency_platform.account_status(actor text,session_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE person bigint; verified boolean; factor boolean; privileged boolean; live boolean;
BEGIN
 SELECT p.id,u."emailVerified",coalesce(u."twoFactorEnabled",false) INTO person,verified,factor
 FROM public."user" u JOIN public."session" s ON s."userId"=u.id AND s.id=session_key AND s."expiresAt">clock_timestamp()
 LEFT JOIN public.portal_users p ON p.external_id=u.id WHERE u.id=actor FOR SHARE OF u,s;
 IF NOT FOUND THEN RAISE EXCEPTION 'Account session unavailable' USING ERRCODE='42501'; END IF;
 live:=NOT EXISTS(SELECT 1 FROM agency_platform.account_controls c WHERE c.actor=account_status.actor AND c.disabled);
 privileged:=EXISTS(SELECT 1 FROM agency_platform.platform_memberships m WHERE m.user_id=person AND m.is_active)
 OR EXISTS(SELECT 1 FROM public.portal_admins a WHERE a.user_id=person AND a.is_active)
 OR EXISTS(SELECT 1 FROM agency_platform.memberships m JOIN agency_platform.agencies a ON a.id=m.agency_id AND a.is_active
 WHERE m.user_id=person AND m.is_active AND m.role='agency_admin');
 RETURN jsonb_build_object('active',live,'required',privileged,'emailVerified',verified,'twoFactorEnabled',factor,
 'assured',live AND verified AND factor AND EXISTS(SELECT 1 FROM agency_platform.session_factors f
 WHERE f.session_id=session_key AND f.actor=account_status.actor AND f.verified_at>clock_timestamp()-interval '12 hours'));
END $$;
CREATE FUNCTION agency_platform.account_session(actor text,session_key text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE state jsonb;
BEGIN
 state:=agency_platform.account_status(actor,session_key);
 IF NOT (state->>'active')::boolean OR NOT (state->>'emailVerified')::boolean OR ((state->>'required')::boolean AND NOT (state->>'assured')::boolean) THEN
 RAISE EXCEPTION 'Account security required' USING ERRCODE='42501'; END IF;
END $$;
-- Attestation is accepted only from the private application runtime. Its caller
-- is a successful Better Auth verification hook, never request JSON or headers.
CREATE FUNCTION agency_platform.record_session_factor(session_token text,method text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE session_key text; person text;
BEGIN
 SELECT s.id,u.id INTO session_key,person FROM public."session" s JOIN public."user" u ON u.id=s."userId"
 WHERE s.token=session_token AND s."expiresAt">clock_timestamp() AND u."emailVerified" AND u."twoFactorEnabled"
 AND NOT EXISTS(SELECT 1 FROM agency_platform.account_controls c WHERE c.actor=u.id AND c.disabled) FOR SHARE OF s,u;
 IF NOT FOUND OR method NOT IN ('totp','backup') THEN RAISE EXCEPTION 'Factor session unavailable' USING ERRCODE='42501'; END IF;
 INSERT INTO agency_platform.session_factors(session_id,actor,method) VALUES(session_key,person,method)
 ON CONFLICT(session_id) DO UPDATE SET verified_at=clock_timestamp(),method=EXCLUDED.method;
 INSERT INTO agency_platform.account_security_audit(actor,action) VALUES(person,'factor.verified');
END $$;

CREATE OR REPLACE FUNCTION agency_platform.console_actor(actor text,session_key text,write_access boolean)
RETURNS TABLE(user_id bigint,role text,name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 PERFORM agency_platform.account_session(actor,session_key);
 RETURN QUERY SELECT u.id,m.role,u.display_name FROM public.portal_users u
 JOIN public."session" s ON s."userId"=u.external_id AND s.id=session_key AND s."expiresAt">clock_timestamp()
 JOIN agency_platform.platform_memberships m ON m.user_id=u.id AND m.is_active
 WHERE u.external_id=actor AND (NOT write_access OR m.role='owner')
 AND NOT EXISTS(SELECT 1 FROM public.portal_internal_users i WHERE i.user_id=u.id)
 FOR SHARE OF u,s,m;
 IF NOT FOUND THEN RAISE EXCEPTION 'Platform access denied' USING ERRCODE='42501'; END IF;
END $$;

CREATE OR REPLACE FUNCTION agency_platform.support_actor(actor text,session_key text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE person bigint;
BEGIN
 PERFORM agency_platform.account_session(actor,session_key);
 SELECT u.id INTO person FROM public.portal_users u JOIN public."session" s ON s."userId"=u.external_id
 WHERE u.external_id=actor AND s.id=session_key AND s."expiresAt">clock_timestamp()
 AND NOT EXISTS(SELECT 1 FROM public.portal_internal_users i WHERE i.user_id=u.id) FOR SHARE OF u,s;
 IF person IS NULL THEN RAISE EXCEPTION 'Support access denied' USING ERRCODE='42501'; END IF;
 RETURN person;
END $$;

CREATE OR REPLACE FUNCTION agency_platform.job_scope(kind text,item text,actor text,session_key text,selected bigint)
RETURNS TABLE(agency_id bigint,client_id bigint,version text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE owning bigint; target bigint; person bigint; stamp text; site uuid;
BEGIN
 IF actor IS NOT NULL OR session_key IS NOT NULL THEN PERFORM agency_platform.account_session(actor,session_key); END IF;
 IF kind='hubstaff' THEN
   SELECT c.id,md5(c.hubstaff_project_url) INTO target,stamp FROM public.portal_clients c
    WHERE c.id::text=item AND c.portal_enabled AND c.ai_enabled FOR SHARE;
 ELSIF kind='source' THEN
   SELECT b.agency_id,md5(concat_ws('|',b.generation,c.connected_at,c.oauth_client_id,c.root_folder_id)) INTO owning,stamp
    FROM agency_platform.connection_bindings b
    JOIN public.portal_drive_source_connections c ON c.owner_id=b.owner_id
    JOIN public.portal_admins p ON p.user_id=b.owner_id AND p.is_active
    WHERE b.service='drive' AND b.resource=item AND b.owner_id::text=item FOR SHARE OF b,c,p;
 ELSIF kind='report' THEN
   SELECT r.client_id,r.website_id,md5(s.url) INTO target,site,stamp
    FROM public.portal_website_insights_reports r
    JOIN public.portal_website_insights_sites s ON s.id=r.website_id AND s.client_id=r.client_id AND s.archived_at IS NULL
    WHERE r.id::text=item AND r.client_id=selected FOR SHARE OF s;
   SELECT u.id INTO person FROM public.portal_users u JOIN public."session" s ON s."userId"=u.external_id
    WHERE u.external_id=actor AND s.id=session_key AND s."expiresAt">clock_timestamp() FOR SHARE OF u,s;
   IF person IS NULL OR EXISTS(SELECT 1 FROM public.portal_internal_users i WHERE i.user_id=person) THEN
     RAISE EXCEPTION 'Job access denied' USING ERRCODE='42501';
   END IF;
   -- Lock revocable grants through the final result commit. An earlier snapshot
   -- or a still-valid browser cookie is insufficient authority.
   PERFORM 1 FROM public.portal_memberships p WHERE p.user_id =person AND p.client_id=target FOR SHARE;
   PERFORM 1 FROM agency_platform.memberships m WHERE m.user_id =person FOR SHARE;
   PERFORM 1 FROM agency_platform.client_access g WHERE g.user_id =person AND g.client_id=target FOR SHARE;
   IF NOT EXISTS(SELECT 1 FROM agency_platform.request_workspaces(actor) w WHERE w.client_id=target AND w.is_aoc AND w.client_role IN ('member','client_admin','aoc_admin') AND w.access_level<>'read') THEN
     RAISE EXCEPTION 'Job access denied' USING ERRCODE='42501';
   END IF;
   PERFORM pg_advisory_xact_lock(hashtextextended('connection:search_console:'||site,27));
   PERFORM 1 FROM agency_platform.connection_bindings b WHERE b.service='search_console' AND b.resource=site::text FOR SHARE;
   stamp:=md5(stamp||coalesce((SELECT b.generation::text FROM agency_platform.connection_bindings b
     WHERE b.service='search_console' AND b.resource=site::text),'unconnected'));
 END IF;
 IF target IS NOT NULL THEN
   SELECT o.agency_id INTO owning FROM agency_platform.client_ownership o
     JOIN public.portal_clients c ON c.id=o.client_id AND c.portal_enabled WHERE o.client_id=target FOR SHARE OF o,c;
 END IF;
 PERFORM 1 FROM agency_platform.agencies a JOIN agency_platform.backfill_state s ON s.aoc_agency_id=a.id AND s.active
   WHERE a.id=owning AND a.is_active FOR SHARE OF a,s;
 IF NOT FOUND OR stamp IS NULL THEN RAISE EXCEPTION 'Job access denied' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT owning,target,stamp;
END $$;

-- Members & Access requests reuse agency invitations. A Client Administrator
-- can request Viewer/Member access; agency staff must explicitly approve it
-- before any bearer is issued or membership is created.
CREATE FUNCTION agency_platform.request_client_invitation(actor text,session_key text,client bigint,email text,offered text,operation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE person bigint; target bigint; v_recipient bigint;
BEGIN
 person:=agency_platform.support_actor(actor,session_key);
 SELECT w.agency_id INTO target FROM agency_platform.request_workspaces(actor) w
 JOIN agency_platform.agency_governance g ON g.agency_id=w.agency_id AND g.enabled
 WHERE w.client_id=client AND w.client_role='client_admin' AND w.access_level='manage';
 IF target IS NULL OR offered NOT IN ('client_viewer','member') THEN RAISE EXCEPTION 'Client access denied' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('agency-admin:'||target,13));
 SELECT p.id INTO v_recipient FROM public.portal_users p JOIN public."user" u ON u.id=p.external_id WHERE lower(u.email)=lower(request_client_invitation.email)
 AND NOT EXISTS(SELECT 1 FROM public.portal_internal_users i WHERE i.user_id=p.id);
 -- Do not expose whether an unrelated global account exists. No unknown-user
 -- identity or credential is created; initial provisioning stays private.
 IF v_recipient IS NULL OR v_recipient=person OR EXISTS(SELECT 1 FROM agency_platform.memberships m WHERE m.agency_id=target AND m.user_id=v_recipient AND m.is_active)
 THEN RETURN jsonb_build_object('pending',true); END IF;
 UPDATE agency_platform.agency_invitations SET status='revoked' WHERE agency_id=target AND agency_invitations.recipient=v_recipient
 AND status='pending' AND expires_at<=clock_timestamp();
 IF EXISTS(SELECT 1 FROM agency_platform.agency_invitations i WHERE i.agency_id=target AND i.recipient=v_recipient AND i.status='pending') THEN RETURN jsonb_build_object('pending',true); END IF;
 INSERT INTO agency_platform.agency_invitations(id,agency_id,recipient,inviter,role,client_id,client_role)
 VALUES(operation,target,v_recipient,person,'client_user',client,offered);
 INSERT INTO agency_platform.agency_admin_audit(agency_id,client_id,actor_id,action,reason,details)
 VALUES(target,client,person,'invite.request','Client Administrator requested agency approval',jsonb_build_object('invitationId',operation));
 RETURN jsonb_build_object('pending',true);
END $$;
CREATE FUNCTION agency_platform.invitation_review(actor text,session_key text,target bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE p record;
BEGIN
 SELECT * INTO p FROM agency_platform.agency_admin_actor(actor,session_key,target);
 IF p.role<>'agency_admin' THEN RETURN '[]'::jsonb; END IF;
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM (
 SELECT i.id,i.role,i.client_id::text AS "clientId",i.client_role AS "clientRole",i.expires_at AS "expiresAt",
 u.display_name AS "recipientName",account.email AS "recipientEmail",c.display_name AS "clientName",
 inviter.display_name AS "requestedBy",coalesce(m.role='client_user',false) AS "approvalRequired"
 FROM agency_platform.agency_invitations i JOIN public.portal_users u ON u.id=i.recipient
 JOIN public."user" account ON account.id=u.external_id JOIN public.portal_users inviter ON inviter.id=i.inviter
 LEFT JOIN public.portal_clients c ON c.id=i.client_id
 LEFT JOIN agency_platform.memberships m ON m.agency_id=target AND m.user_id=i.inviter AND m.is_active
 WHERE i.agency_id=target AND i.status='pending' ORDER BY i.created_at DESC LIMIT 100) r),'[]'::jsonb);
END $$;
CREATE FUNCTION agency_platform.issue_invitation_link(actor text,session_key text,target bigint,requested uuid,hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE p record; i agency_platform.agency_invitations%ROWTYPE; email text; author_role text;
BEGIN
 SELECT * INTO p FROM agency_platform.agency_admin_actor(actor,session_key,target);
 IF p.role<>'agency_admin' THEN RAISE EXCEPTION 'Invitation unavailable' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('agency-admin:'||target,13));
 SELECT * INTO i FROM agency_platform.agency_invitations WHERE id=requested AND agency_id=target FOR UPDATE;
 IF NOT FOUND OR i.status<>'pending' OR i.expires_at<=clock_timestamp() OR (i.role='agency_admin' AND NOT p.is_owner) THEN
 RAISE EXCEPTION 'Invitation unavailable' USING ERRCODE='42501'; END IF;
 SELECT m.role INTO author_role FROM agency_platform.memberships m WHERE m.agency_id=target AND m.user_id=i.inviter AND m.is_active;
 IF author_role IS NULL OR author_role NOT IN ('agency_admin','client_user') THEN RAISE EXCEPTION 'Invitation unavailable' USING ERRCODE='42501'; END IF;
 IF author_role='client_user' THEN
  PERFORM 1 FROM public.portal_memberships m JOIN agency_platform.client_access c ON c.client_id=m.client_id AND c.user_id=m.user_id AND c.agency_id=target AND c.is_active AND c.access_level='manage'
  WHERE m.client_id=i.client_id AND m.user_id=i.inviter AND m.is_active AND m.role='client_admin';
  IF NOT FOUND OR i.role<>'client_user' OR i.client_role NOT IN ('client_viewer','member') THEN RAISE EXCEPTION 'Invitation unavailable' USING ERRCODE='42501'; END IF;
  UPDATE agency_platform.agency_invitations SET inviter=p.person WHERE id=i.id;
  INSERT INTO agency_platform.agency_admin_audit(agency_id,client_id,actor_id,action,reason,details)
  VALUES(target,i.client_id,p.person,'invite.approve','Agency Administrator approved the scoped client invitation',jsonb_build_object('invitationId',i.id));
 END IF;
 SELECT u.email INTO STRICT email FROM public."user" u JOIN public.portal_users pu ON pu.external_id=u.id WHERE pu.id=i.recipient;
 INSERT INTO agency_platform.invitation_links(invitation_id,secret_hash,expires_at) VALUES(i.id,hash,i.expires_at)
 ON CONFLICT(invitation_id) DO UPDATE SET secret_hash=EXCLUDED.secret_hash,expires_at=EXCLUDED.expires_at,used_at=NULL;
 INSERT INTO agency_platform.account_security_audit(actor,action,invitation_id) VALUES(actor,'invitation.issued',i.id);
 RETURN jsonb_build_object('recipient',email,'expiresAt',i.expires_at);
END $$;
-- Keep Stage 13 membership creation and authority checks as the sole acceptance
-- implementation; its UUID-only entry becomes owner-internal after this stage.
ALTER FUNCTION agency_platform.agency_accept_invitation(text,text,uuid) RENAME TO accept_invitation_internal;
CREATE FUNCTION agency_platform.agency_accept_invitation(actor text,session_key text,requested uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN RAISE EXCEPTION 'A secure invitation link is required' USING ERRCODE='42501'; END $$;
CREATE FUNCTION agency_platform.accept_invitation_link(actor text,session_key text,requested uuid,hash text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE i agency_platform.agency_invitations%ROWTYPE; person bigint;
BEGIN
 person:=agency_platform.support_actor(actor,session_key);
 SELECT * INTO i FROM agency_platform.agency_invitations WHERE id=requested AND recipient=person;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invitation unavailable' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('agency-admin:'||i.agency_id,13));
 PERFORM 1 FROM agency_platform.invitation_links l WHERE l.invitation_id=requested AND l.secret_hash=hash
 AND l.used_at IS NULL AND l.expires_at>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invitation unavailable' USING ERRCODE='42501'; END IF;
 PERFORM agency_platform.accept_invitation_internal(actor,session_key,requested);
 UPDATE agency_platform.invitation_links SET used_at=clock_timestamp() WHERE invitation_id=requested;
 INSERT INTO agency_platform.account_security_audit(actor,action,invitation_id) VALUES(actor,'invitation.accepted',requested);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA agency_platform FROM PUBLIC;
