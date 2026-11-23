-- Stage16A: reusable delivery guidance, immutable approvals and scoped progress.
-- No existing identity, assignment, source, tool or membership is changed.
CREATE TABLE agency_platform.delivery_profiles (
 id uuid PRIMARY KEY,agency_id bigint NOT NULL REFERENCES agency_platform.agencies(id),
 fields jsonb NOT NULL,revision bigint NOT NULL CHECK(revision>0),approved_revision bigint,
 retired boolean NOT NULL DEFAULT false,updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(agency_id,id)
);
CREATE TABLE agency_platform.delivery_profile_revisions (
 agency_id bigint NOT NULL,profile_id uuid NOT NULL,revision bigint NOT NULL,
 fields jsonb NOT NULL,approved_by bigint NOT NULL REFERENCES public.portal_users(id),approved_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(agency_id,profile_id,revision),FOREIGN KEY(agency_id,profile_id) REFERENCES agency_platform.delivery_profiles(agency_id,id)
);
ALTER TABLE agency_platform.delivery_profiles ADD FOREIGN KEY(agency_id,id,approved_revision)
 REFERENCES agency_platform.delivery_profile_revisions(agency_id,profile_id,revision);
CREATE TABLE agency_platform.delivery_onboarding (
 id uuid PRIMARY KEY,agency_id bigint NOT NULL,client_id bigint NOT NULL,user_id bigint NOT NULL,
 profile_id uuid NOT NULL,profile_revision bigint NOT NULL,assignment_id uuid REFERENCES agency_platform.specialist_assignments(id),
 review_owner bigint NOT NULL REFERENCES public.portal_users(id),approved_by bigint NOT NULL REFERENCES public.portal_users(id),
 expires_at timestamptz NOT NULL,revoked_at timestamptz,revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0),
 steps jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '90 days'),
 FOREIGN KEY(agency_id,client_id) REFERENCES agency_platform.client_ownership(agency_id,client_id),
 FOREIGN KEY(agency_id,user_id) REFERENCES agency_platform.memberships(agency_id,user_id),
 FOREIGN KEY(agency_id,profile_id,profile_revision) REFERENCES agency_platform.delivery_profile_revisions(agency_id,profile_id,revision)
);
CREATE INDEX delivery_onboarding_participant ON agency_platform.delivery_onboarding(user_id,agency_id,client_id);
CREATE TABLE agency_platform.delivery_onboarding_operations (
 operation uuid PRIMARY KEY,agency_id bigint NOT NULL REFERENCES agency_platform.agencies(id),
 actor_id bigint NOT NULL REFERENCES public.portal_users(id),fingerprint text NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE agency_platform.delivery_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_platform.delivery_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE agency_platform.delivery_profile_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_platform.delivery_profile_revisions FORCE ROW LEVEL SECURITY;
ALTER TABLE agency_platform.delivery_onboarding ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_platform.delivery_onboarding FORCE ROW LEVEL SECURITY;
ALTER TABLE agency_platform.delivery_onboarding_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_platform.delivery_onboarding_operations FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_control ON agency_platform.delivery_profiles TO aoc_agency_owner USING(true) WITH CHECK(true);
CREATE POLICY owner_control ON agency_platform.delivery_profile_revisions TO aoc_agency_owner USING(true) WITH CHECK(true);
CREATE POLICY owner_control ON agency_platform.delivery_onboarding TO aoc_agency_owner USING(true) WITH CHECK(true);
CREATE POLICY owner_control ON agency_platform.delivery_onboarding_operations TO aoc_agency_owner USING(true) WITH CHECK(true);

CREATE FUNCTION agency_platform.valid_delivery_profile(value jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
DECLARE k text;v jsonb;
BEGIN
 IF jsonb_typeof(value) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
 FOR k,v IN SELECT * FROM jsonb_each(value) LOOP
  IF NOT k=ANY(ARRAY['name','specialty','adjacentWork','tools','clientContext','aiGuidance','excludedResponsibilities','deliverables','reviewOwnerGuidance','successCriteria','businessKnowledge','agencyStandards','accessRequests','firstTask','externalToolUrl'])
   OR jsonb_typeof(v)<>'string' OR length(v#>>'{}')>1500 OR translate(v#>>'{}',chr(10)||chr(9),'')~'[<>[:cntrl:]]' THEN RETURN false; END IF;
 END LOOP;
 IF length(coalesce(value->>'name',''))>120 OR length(coalesce(value->>'externalToolUrl',''))>500 THEN RETURN false; END IF;
 RETURN coalesce(value->>'externalToolUrl','')='' OR value->>'externalToolUrl' ~ '^https://[^/@[:space:]]+[.][^/@[:space:]]+([/?#]|$)';
END $$;
ALTER TABLE agency_platform.delivery_profiles ADD CHECK(agency_platform.valid_delivery_profile(fields));
ALTER TABLE agency_platform.delivery_profile_revisions ADD CHECK(agency_platform.valid_delivery_profile(fields));

-- Read authority is evaluated afresh. Profiles and engagement metadata confer none.
CREATE FUNCTION agency_platform.onboarding_scope(actor text,session_key text,requested uuid,writing boolean)
RETURNS agency_platform.delivery_onboarding LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE person bigint;r agency_platform.delivery_onboarding%ROWTYPE;x agency_platform.specialist_assignments%ROWTYPE;
BEGIN
 person:=agency_platform.support_actor(actor,session_key);
 SELECT o.* INTO r FROM agency_platform.delivery_onboarding o
 JOIN agency_platform.agencies a ON a.id=o.agency_id AND a.is_active
 JOIN agency_platform.agency_governance g ON g.agency_id=a.id AND g.enabled
 JOIN agency_platform.memberships m ON (m.agency_id,m.user_id)=(o.agency_id,o.user_id) AND m.is_active AND m.role IN ('staff','agency_admin')
 JOIN agency_platform.memberships reviewer ON (reviewer.agency_id,reviewer.user_id)=(o.agency_id,o.review_owner) AND reviewer.is_active AND reviewer.role='agency_admin'
 JOIN public.portal_clients c ON c.id=o.client_id AND c.portal_enabled
 JOIN agency_platform.delivery_profiles p ON (p.agency_id,p.id)=(o.agency_id,o.profile_id) AND NOT p.retired
 WHERE o.id=requested AND o.user_id=person AND o.revoked_at IS NULL AND o.expires_at>clock_timestamp()
 AND NOT EXISTS(SELECT 1 FROM public.portal_internal_users i WHERE i.user_id IN(o.user_id,o.review_owner))
 FOR SHARE OF o,a,g,m,reviewer,c,p;
 IF NOT FOUND THEN RAISE EXCEPTION 'Delivery onboarding access denied' USING ERRCODE='42501'; END IF;
 IF r.assignment_id IS NOT NULL THEN
  x:=agency_platform.specialist_scope(actor,session_key,r.assignment_id,CASE WHEN writing THEN 'delivery.notes.write' ELSE 'delivery.read' END);
  IF (x.agency_id,x.client_id,x.user_id)<>(r.agency_id,r.client_id,r.user_id) THEN RAISE EXCEPTION 'Assignment mismatch' USING ERRCODE='42501'; END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM agency_platform.agency_visible_clients(actor,session_key,r.agency_id) c WHERE c=r.client_id) THEN RAISE EXCEPTION 'Client access denied' USING ERRCODE='42501'; END IF;
  IF writing AND NOT EXISTS(SELECT 1 FROM agency_platform.memberships m WHERE m.agency_id=r.agency_id AND m.user_id=person AND m.is_active AND (m.role='agency_admin' OR EXISTS(
   SELECT 1 FROM agency_platform.client_access a JOIN public.portal_memberships p ON (p.client_id,p.user_id)=(a.client_id,a.user_id) AND p.is_active AND p.role IN('member','client_admin')
   WHERE a.agency_id=r.agency_id AND a.client_id=r.client_id AND a.user_id=person AND a.is_active AND a.access_level IN('contribute','manage')))) THEN RAISE EXCEPTION 'Progress update denied' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN r;
END $$;

CREATE FUNCTION agency_platform.onboarding_view(actor text,session_key text,requested uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE person bigint;r agency_platform.delivery_onboarding%ROWTYPE;choices jsonb:='[]';item record;fields jsonb;editable boolean:=false;
BEGIN
 person:=agency_platform.support_actor(actor,session_key);
 IF requested IS NULL THEN
  FOR item IN SELECT id FROM agency_platform.delivery_onboarding WHERE user_id=person AND revoked_at IS NULL AND expires_at>clock_timestamp() ORDER BY created_at DESC LIMIT 200 LOOP
   BEGIN
    r:=agency_platform.onboarding_scope(actor,session_key,item.id,false);
    choices:=choices||jsonb_build_array(jsonb_build_object('id',r.id,'agencyId',r.agency_id::text,'agency',(SELECT display_name FROM agency_platform.agencies WHERE id=r.agency_id),
    'client',(SELECT display_name FROM public.portal_clients WHERE id=r.client_id),'profile',(SELECT p.fields->>'name' FROM agency_platform.delivery_profile_revisions p WHERE (p.agency_id,p.profile_id,p.revision)=(r.agency_id,r.profile_id,r.profile_revision))));
   EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  END LOOP;
  RETURN jsonb_build_object('choices',choices,'selected',NULL);
 END IF;
 r:=agency_platform.onboarding_scope(actor,session_key,requested,false);
 BEGIN PERFORM agency_platform.onboarding_scope(actor,session_key,requested,true);editable:=true;EXCEPTION WHEN insufficient_privilege THEN editable:=false;END;
 SELECT p.fields INTO fields FROM agency_platform.delivery_profile_revisions p WHERE (p.agency_id,p.profile_id,p.revision)=(r.agency_id,r.profile_id,r.profile_revision);
 RETURN jsonb_build_object('selected',r.id,'agency',(SELECT display_name FROM agency_platform.agencies WHERE id=r.agency_id),'client',(SELECT display_name FROM public.portal_clients WHERE id=r.client_id),
  'profile',fields,'profileRevision',r.profile_revision::text,'revision',r.revision::text,'steps',r.steps,'expiresAt',r.expires_at,
  'reviewOwner',(SELECT display_name FROM public.portal_users WHERE id=r.review_owner),'assignmentId',r.assignment_id,'canEdit',editable);
END $$;

CREATE FUNCTION agency_platform.onboarding_admin_view(actor text,session_key text,target bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE p record;
BEGIN
 SELECT * INTO STRICT p FROM agency_platform.agency_admin_actor(actor,session_key,target);
 IF p.role<>'agency_admin' THEN RAISE EXCEPTION 'Agency approval required' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('agency',jsonb_build_object('id',target::text,'slug',(SELECT slug FROM agency_platform.agencies WHERE id=target),'name',(SELECT display_name FROM agency_platform.agencies WHERE id=target)),
 'actor',jsonb_build_object('name',(SELECT display_name FROM public.portal_users WHERE id=p.person)),
 'profiles',coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT id,fields,revision::text,approved_revision::text AS "approvedRevision",retired FROM agency_platform.delivery_profiles WHERE agency_id=target ORDER BY updated_at DESC LIMIT 200)t),'[]'),
 'runs',coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM (SELECT o.id,o.client_id::text AS "clientId",o.user_id::text AS "userId",o.profile_id AS "profileId",o.profile_revision::text AS "profileRevision",o.revision::text,o.revoked_at AS "revokedAt",o.expires_at AS "expiresAt",o.steps,
 (SELECT display_name FROM public.portal_users WHERE id=o.user_id) AS participant,(SELECT display_name FROM public.portal_clients WHERE id=o.client_id) AS client
 FROM agency_platform.delivery_onboarding o WHERE o.agency_id=target ORDER BY o.created_at DESC LIMIT 200)t),'[]'),
 'clients',coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id::text,'name',c.display_name)) FROM public.portal_clients c JOIN agency_platform.client_ownership x ON x.client_id=c.id AND x.agency_id=target WHERE c.portal_enabled),'[]'),
 'people',coalesce((SELECT jsonb_agg(jsonb_build_object('id',m.user_id::text,'name',u.display_name,'role',m.role)) FROM agency_platform.memberships m JOIN public.portal_users u ON u.id=m.user_id WHERE m.agency_id=target AND m.is_active AND m.role IN('staff','agency_admin') AND NOT EXISTS(SELECT 1 FROM public.portal_internal_users i WHERE i.user_id=m.user_id)),'[]'),
 'assignments',coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'userId',s.user_id::text,'clientId',s.client_id::text,'role',s.role_label,'expiresAt',s.expires_at)) FROM agency_platform.specialist_assignments s JOIN agency_platform.specialist_engagements e ON e.id=s.engagement_id AND e.status='active' WHERE s.agency_id=target AND s.status='active' AND s.expires_at>clock_timestamp()),'[]'));
END $$;

CREATE FUNCTION agency_platform.onboarding_admin_change(actor text,session_key text,target bigint,command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE p record;action text:=command->>'action';op uuid:=(command->>'operation')::uuid;
 prior agency_platform.delivery_onboarding_operations%ROWTYPE;profile agency_platform.delivery_profiles%ROWTYPE;r agency_platform.delivery_onboarding%ROWTYPE;
 resource uuid;rev bigint;client bigint;person bigint;reviewer bigint;assignment uuid;expiry timestamptz;result jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('agency-admin:'||target,13));
 SELECT * INTO STRICT p FROM agency_platform.agency_admin_actor(actor,session_key,target);
 IF p.role<>'agency_admin' THEN RAISE EXCEPTION 'Agency approval required' USING ERRCODE='42501'; END IF;
 IF length(trim(command->>'reason')) NOT BETWEEN 3 AND 200 THEN RAISE EXCEPTION 'Approval reason required' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('onboarding-operation:'||op,161));
 SELECT * INTO prior FROM agency_platform.delivery_onboarding_operations WHERE operation=op;
 IF FOUND THEN
  IF prior.agency_id<>target OR prior.actor_id<>p.person OR prior.fingerprint<>md5(command::text) THEN RAISE EXCEPTION 'Operation conflict' USING ERRCODE='40001'; END IF;
  RETURN prior.result;
 END IF;
 resource:=coalesce(nullif(command->>'id','')::uuid,op);
 IF action='profile.save' THEN
  SELECT * INTO profile FROM agency_platform.delivery_profiles WHERE id=resource AND agency_id=target FOR UPDATE;
  IF (FOUND AND profile.revision<>(command->>'revision')::bigint) OR (NOT FOUND AND command->>'revision'<>'0') THEN RAISE EXCEPTION 'Profile changed' USING ERRCODE='40001'; END IF;
  INSERT INTO agency_platform.delivery_profiles(id,agency_id,fields,revision) VALUES(resource,target,command->'fields',1)
  ON CONFLICT(id) DO UPDATE SET fields=EXCLUDED.fields,revision=delivery_profiles.revision+1,updated_at=now() WHERE delivery_profiles.agency_id=target AND NOT delivery_profiles.retired;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile unavailable' USING ERRCODE='42501'; END IF;
 ELSIF action IN('profile.approve','profile.retire') THEN
  SELECT * INTO profile FROM agency_platform.delivery_profiles WHERE id=resource AND agency_id=target AND NOT retired FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile unavailable' USING ERRCODE='42501'; END IF;
  IF profile.revision<>(command->>'revision')::bigint THEN RAISE EXCEPTION 'Profile changed' USING ERRCODE='40001'; END IF;
  IF action='profile.approve' THEN
   IF EXISTS(SELECT 1 FROM unnest(ARRAY['name','specialty','deliverables','successCriteria','firstTask']) k WHERE length(trim(coalesce(profile.fields->>k,'')))=0) THEN RAISE EXCEPTION 'Complete required delivery guidance' USING ERRCODE='22023'; END IF;
   INSERT INTO agency_platform.delivery_profile_revisions(agency_id,profile_id,revision,fields,approved_by) VALUES(target,resource,profile.revision,profile.fields,p.person) ON CONFLICT DO NOTHING;
   UPDATE agency_platform.delivery_profiles SET approved_revision=revision WHERE id=resource;
  ELSE UPDATE agency_platform.delivery_profiles SET retired=true,revision=revision+1 WHERE id=resource; END IF;
 ELSIF action='run.assign' THEN
  resource:=op;person:=(command->>'userId')::bigint;client:=(command->>'clientId')::bigint;reviewer:=(command->>'reviewOwner')::bigint;
  assignment:=nullif(command->>'assignmentId','')::uuid;expiry:=(command->>'expiresAt')::timestamptz;
  SELECT * INTO profile FROM agency_platform.delivery_profiles WHERE id=(command->>'profileId')::uuid AND agency_id=target AND NOT retired FOR SHARE;
  IF NOT FOUND OR profile.approved_revision IS DISTINCT FROM (command->>'profileRevision')::bigint THEN RAISE EXCEPTION 'Choose an approved profile revision' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM agency_platform.client_ownership o JOIN public.portal_clients c ON c.id=o.client_id AND c.portal_enabled WHERE o.agency_id=target AND o.client_id=client)
  OR NOT EXISTS(SELECT 1 FROM agency_platform.memberships m WHERE m.agency_id=target AND m.user_id=person AND m.is_active AND m.role IN('staff','agency_admin'))
  OR NOT EXISTS(SELECT 1 FROM agency_platform.memberships m WHERE m.agency_id=target AND m.user_id=reviewer AND m.is_active AND m.role='agency_admin')
  OR EXISTS(SELECT 1 FROM public.portal_internal_users i WHERE i.user_id IN(person,reviewer)) THEN RAISE EXCEPTION 'Delivery scope unavailable' USING ERRCODE='42501'; END IF;
  IF assignment IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM agency_platform.specialist_assignments s JOIN agency_platform.specialist_engagements e ON e.id=s.engagement_id AND e.status='active'
    WHERE s.id=assignment AND s.agency_id=target AND s.client_id=client AND s.user_id=person AND s.status='active' AND s.expires_at>=expiry AND 'delivery.read'=ANY(s.actions)) THEN RAISE EXCEPTION 'Approved assignment required' USING ERRCODE='42501'; END IF;
  ELSIF NOT EXISTS(SELECT 1 FROM agency_platform.memberships m WHERE m.agency_id=target AND m.user_id=person AND m.is_active AND (m.role='agency_admin' OR EXISTS(
   SELECT 1 FROM agency_platform.client_access a JOIN public.portal_memberships pm ON (pm.client_id,pm.user_id)=(a.client_id,a.user_id) AND pm.is_active WHERE a.agency_id=target AND a.client_id=client AND a.user_id=person AND a.is_active))) THEN RAISE EXCEPTION 'Existing client access required' USING ERRCODE='42501'; END IF;
  INSERT INTO agency_platform.delivery_onboarding(id,agency_id,client_id,user_id,profile_id,profile_revision,assignment_id,review_owner,approved_by,expires_at)
  VALUES(resource,target,client,person,profile.id,profile.approved_revision,assignment,reviewer,p.person,expiry);
 ELSIF action='run.revoke' THEN
  SELECT * INTO r FROM agency_platform.delivery_onboarding WHERE id=resource AND agency_id=target FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Onboarding unavailable' USING ERRCODE='42501'; END IF;
  IF r.revision<>(command->>'revision')::bigint THEN RAISE EXCEPTION 'Onboarding changed' USING ERRCODE='40001'; END IF;
  client:=r.client_id;UPDATE agency_platform.delivery_onboarding SET revoked_at=now(),revision=revision+1 WHERE id=resource;
 ELSE RAISE EXCEPTION 'Unsupported action' USING ERRCODE='22023'; END IF;
 result:=jsonb_build_object('saved',true,'id',resource);
 INSERT INTO agency_platform.delivery_onboarding_operations VALUES(op,target,p.person,md5(command::text),result,now());
 INSERT INTO agency_platform.agency_admin_audit(operation,agency_id,client_id,actor_id,action,reason,details)
 VALUES(op,target,client,p.person,'onboarding.'||action,command->>'reason',jsonb_build_object('resource',resource));
 RETURN result;
END $$;

CREATE FUNCTION agency_platform.onboarding_progress(actor text,session_key text,command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE r agency_platform.delivery_onboarding%ROWTYPE;prior agency_platform.delivery_onboarding_operations%ROWTYPE;
 op uuid:=(command->>'operation')::uuid;result jsonb;step text:=command->>'step';state text:=command->>'status';note text:=coalesce(command->>'note','');
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('onboarding-run:'||(command->>'id'),161));
 r:=agency_platform.onboarding_scope(actor,session_key,(command->>'id')::uuid,true);
 PERFORM pg_advisory_xact_lock(hashtextextended('onboarding-operation:'||op,161));
 SELECT * INTO prior FROM agency_platform.delivery_onboarding_operations WHERE operation=op;
 IF FOUND THEN
  IF prior.agency_id<>r.agency_id OR prior.actor_id<>r.user_id OR prior.fingerprint<>md5(command::text) THEN RAISE EXCEPTION 'Operation conflict' USING ERRCODE='40001'; END IF;
  RETURN prior.result;
 END IF;
 IF r.revision<>(command->>'revision')::bigint THEN RAISE EXCEPTION 'Onboarding changed' USING ERRCODE='40001'; END IF;
 IF step NOT IN('businessKnowledge','agencyStandards','accessRequests','firstTask') OR state NOT IN('todo','in_progress','blocked','complete') OR length(note)>600 OR note~'[<>[:cntrl:]]'
 THEN RAISE EXCEPTION 'Invalid checklist update' USING ERRCODE='22023'; END IF;
 UPDATE agency_platform.delivery_onboarding SET steps=jsonb_set(steps,ARRAY[step],jsonb_build_object('status',state,'note',note,'updatedAt',clock_timestamp())),revision=revision+1 WHERE id=r.id;
 PERFORM agency_platform.onboarding_scope(actor,session_key,r.id,true);
 result:=jsonb_build_object('saved',true,'id',r.id);
 INSERT INTO agency_platform.delivery_onboarding_operations VALUES(op,r.agency_id,r.user_id,md5(command::text),result,now());
 INSERT INTO agency_platform.agency_admin_audit(operation,agency_id,client_id,actor_id,action,reason,details)
 VALUES(op,r.agency_id,r.client_id,r.user_id,'onboarding.progress','Participant updated delivery onboarding',jsonb_build_object('resource',r.id,'step',step,'status',state));
 RETURN result;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA agency_platform FROM PUBLIC;
