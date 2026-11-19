-- Staffing metadata is separate from agency membership and customer ACLs.
CREATE TABLE agency_platform.specialist_engagements (
 id uuid PRIMARY KEY,
 agency_id bigint NOT NULL REFERENCES agency_platform.agencies(id),
 user_id bigint REFERENCES public.portal_users(id),
 reference text NOT NULL CHECK(length(reference) BETWEEN 1 AND 100),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','ended')),
 created_by bigint NOT NULL REFERENCES public.portal_users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(agency_id,id,user_id)
);
CREATE TABLE agency_platform.specialist_assignments (
 id uuid PRIMARY KEY,
 agency_id bigint NOT NULL,
 client_id bigint NOT NULL,
 engagement_id uuid NOT NULL,
 user_id bigint NOT NULL,
 work_type text NOT NULL CHECK(work_type IN ('development','design','seo','content','operations')),
 actions text[] NOT NULL CHECK(cardinality(actions) BETWEEN 1 AND 3 AND actions<@ARRAY['delivery.read','delivery.files.read','delivery.notes.write']::text[] AND 'delivery.read'=ANY(actions)),
 file_ids text[] NOT NULL DEFAULT '{}' CHECK(cardinality(file_ids)<=20),
 role_label text NOT NULL CHECK(length(role_label) BETWEEN 1 AND 100),
 responsibilities text NOT NULL CHECK(length(responsibilities) BETWEEN 1 AND 1000),
 deliverables text NOT NULL CHECK(length(deliverables) BETWEEN 1 AND 1000),
 handoff text NOT NULL DEFAULT '' CHECK(length(handoff)<=1000),
 review_owner bigint NOT NULL REFERENCES public.portal_users(id),
 approved_by bigint NOT NULL REFERENCES public.portal_users(id),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked','replaced')),
 revision bigint NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '90 days'),
 FOREIGN KEY(agency_id,client_id) REFERENCES agency_platform.client_ownership(agency_id,client_id),
 FOREIGN KEY(agency_id,engagement_id,user_id) REFERENCES agency_platform.specialist_engagements(agency_id,id,user_id),
 FOREIGN KEY(agency_id,user_id) REFERENCES agency_platform.memberships(agency_id,user_id)
);
CREATE INDEX specialist_active_scope ON agency_platform.specialist_assignments(user_id,agency_id,client_id) WHERE status='active';
CREATE TABLE agency_platform.specialist_notes (
 id uuid PRIMARY KEY,
 assignment_id uuid NOT NULL REFERENCES agency_platform.specialist_assignments(id),
 author bigint NOT NULL REFERENCES public.portal_users(id),
 body text NOT NULL CHECK(length(body) BETWEEN 1 AND 1000),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE agency_platform.specialist_engagements ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_platform.specialist_engagements FORCE ROW LEVEL SECURITY;
ALTER TABLE agency_platform.specialist_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_platform.specialist_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE agency_platform.specialist_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_platform.specialist_notes FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_control ON agency_platform.specialist_engagements TO aoc_agency_owner USING(true) WITH CHECK(true);
CREATE POLICY owner_control ON agency_platform.specialist_assignments TO aoc_agency_owner USING(true) WITH CHECK(true);
CREATE POLICY owner_control ON agency_platform.specialist_notes TO aoc_agency_owner USING(true) WITH CHECK(true);

CREATE FUNCTION agency_platform.specialist_scope(actor text,session_key text,assignment uuid,action text)
RETURNS agency_platform.specialist_assignments LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE person bigint; result agency_platform.specialist_assignments%ROWTYPE;
BEGIN
 person:=agency_platform.support_actor(actor,session_key);
 SELECT x.* INTO result FROM agency_platform.specialist_assignments x
 JOIN agency_platform.specialist_engagements e ON (e.agency_id,e.id,e.user_id)=(x.agency_id,x.engagement_id,x.user_id) AND e.status='active'
 JOIN agency_platform.agencies a ON a.id=x.agency_id AND a.is_active
 JOIN agency_platform.agency_governance g ON g.agency_id=a.id AND g.enabled
 JOIN agency_platform.memberships m ON m.agency_id=a.id AND m.user_id=x.user_id AND m.is_active
 JOIN agency_platform.client_ownership o ON (o.agency_id,o.client_id)=(x.agency_id,x.client_id)
 JOIN public.portal_clients c ON c.id=x.client_id AND c.portal_enabled
 JOIN agency_platform.memberships reviewer ON reviewer.agency_id=a.id AND reviewer.user_id=x.review_owner AND reviewer.is_active AND reviewer.role='agency_admin'
 WHERE x.id=assignment AND x.user_id=person AND x.status='active' AND x.expires_at>clock_timestamp() AND action=ANY(x.actions)
 AND NOT EXISTS(SELECT 1 FROM public.portal_internal_users i WHERE i.user_id=x.review_owner)
 FOR SHARE OF x,e,a,g,m,o,c,reviewer;
 IF NOT FOUND THEN RAISE EXCEPTION 'Assignment access denied' USING ERRCODE='42501'; END IF;
 RETURN result;
END $$;

-- Explicit whitelist: no HR, payroll, candidate, coaching or private-source join.
CREATE FUNCTION agency_platform.specialist_evidence(actor text,session_key text,assignment uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE x agency_platform.specialist_assignments%ROWTYPE;
BEGIN
 x:=agency_platform.specialist_scope(actor,session_key,assignment,'delivery.read');
 RETURN jsonb_build_object('assignmentId',x.id,'agencyId',x.agency_id::text,'clientId',x.client_id::text,'workType',x.work_type,
 'role',x.role_label,'responsibilities',x.responsibilities,'deliverables',x.deliverables,'handoff',x.handoff,
 'reviewOwner',(SELECT display_name FROM public.portal_users WHERE id=x.review_owner),'expiresAt',x.expires_at,
 'untrustedData',true);
END $$;
CREATE FUNCTION agency_platform.specialist_delivery(actor text,session_key text,requested uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE person bigint; x agency_platform.specialist_assignments%ROWTYPE; choices jsonb; files jsonb;
BEGIN
 person:=agency_platform.support_actor(actor,session_key);
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'agency',agency.display_name,'client',c.display_name,'role',a.role_label,'expiresAt',a.expires_at) ORDER BY agency.display_name,c.display_name),'[]'::jsonb)
 INTO choices FROM agency_platform.specialist_assignments a
 JOIN agency_platform.agencies agency ON agency.id=a.agency_id AND agency.is_active
 JOIN agency_platform.agency_governance g ON g.agency_id=agency.id AND g.enabled
 JOIN agency_platform.memberships m ON m.agency_id=agency.id AND m.user_id=a.user_id AND m.is_active
 JOIN agency_platform.specialist_engagements e ON e.id=a.engagement_id AND e.status='active'
 JOIN agency_platform.memberships r ON r.agency_id=agency.id AND r.user_id=a.review_owner AND r.is_active AND r.role='agency_admin'
 JOIN public.portal_clients c ON c.id=a.client_id AND c.portal_enabled
 WHERE a.user_id=person AND a.status='active' AND a.expires_at>clock_timestamp()
 AND NOT EXISTS(SELECT 1 FROM public.portal_internal_users i WHERE i.user_id=a.review_owner);
 IF requested IS NULL THEN RETURN jsonb_build_object('assignments',choices,'selected',NULL); END IF;
 x:=agency_platform.specialist_scope(actor,session_key,requested,'delivery.read');
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',f.id,'title',f.title,'filename',f.filename)),'[]'::jsonb) INTO files
 FROM public.portal_client_library f WHERE f.client_id=x.client_id AND f.id=ANY(x.file_ids) AND f.source_type='file' AND 'delivery.files.read'=ANY(x.actions);
 RETURN jsonb_build_object('assignments',choices,'selected',x.id,'revision',x.revision::text,'context',agency_platform.specialist_evidence(actor,session_key,requested),
 'actions',x.actions,'files',files,'notes',coalesce((SELECT jsonb_agg(jsonb_build_object('id',n.id,'body',n.body,'createdAt',n.created_at) ORDER BY n.created_at DESC)
 FROM (SELECT * FROM agency_platform.specialist_notes WHERE assignment_id=x.id ORDER BY created_at DESC LIMIT 50) n),'[]'::jsonb));
END $$;
CREATE FUNCTION agency_platform.specialist_file(actor text,session_key text,requested uuid,item text)
RETURNS TABLE(filename text,mime_type text,content bytea)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE x agency_platform.specialist_assignments%ROWTYPE;
BEGIN
 x:=agency_platform.specialist_scope(actor,session_key,requested,'delivery.files.read');
 RETURN QUERY SELECT f.filename,f.mime_type,f.content FROM public.portal_client_library f
 WHERE f.id=item AND f.client_id=x.client_id AND f.id=ANY(x.file_ids) AND f.source_type='file';
 IF NOT FOUND THEN RAISE EXCEPTION 'File unavailable' USING ERRCODE='42501'; END IF;
END $$;
CREATE FUNCTION agency_platform.specialist_note(actor text,session_key text,requested uuid,key uuid,value text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE x agency_platform.specialist_assignments%ROWTYPE; previous agency_platform.specialist_notes%ROWTYPE;
BEGIN
 x:=agency_platform.specialist_scope(actor,session_key,requested,'delivery.notes.write');
 PERFORM pg_advisory_xact_lock(hashtextextended('specialist-note:'||key,131));
 PERFORM agency_platform.specialist_scope(actor,session_key,requested,'delivery.notes.write');
 SELECT * INTO previous FROM agency_platform.specialist_notes WHERE id=key;
 IF FOUND THEN
  IF previous.assignment_id<>requested OR previous.author<>x.user_id OR previous.body<>value THEN RAISE EXCEPTION 'Note conflict' USING ERRCODE='40001'; END IF;
  RETURN;
 END IF;
 INSERT INTO agency_platform.specialist_notes(id,assignment_id,author,body) VALUES(key,requested,x.user_id,value);
 INSERT INTO agency_platform.agency_admin_audit(agency_id,client_id,actor_id,action,reason)
 VALUES(x.agency_id,x.client_id,x.user_id,'specialist.note','Specialist delivery note saved');
 PERFORM agency_platform.specialist_scope(actor,session_key,requested,'delivery.notes.write');
END $$;

CREATE FUNCTION agency_platform.specialist_admin_view(actor text,session_key text,target bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE p record;
BEGIN
 SELECT * INTO STRICT p FROM agency_platform.agency_admin_actor(actor,session_key,target);
 IF p.role<>'agency_admin' THEN RAISE EXCEPTION 'Agency approval required' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('engagements',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'reference',e.reference,'account',u.external_id,'name',u.display_name,'status',e.status))
 FROM agency_platform.specialist_engagements e LEFT JOIN public.portal_users u ON u.id=e.user_id WHERE e.agency_id=target),'[]'::jsonb),
 'assignments',coalesce((SELECT jsonb_agg(jsonb_build_object('id',x.id,'clientId',x.client_id::text,'userId',x.user_id::text,'role',x.role_label,'workType',x.work_type,
 'status',x.status,'expiresAt',x.expires_at,'revision',x.revision::text,'actions',x.actions)) FROM agency_platform.specialist_assignments x WHERE x.agency_id=target),'[]'::jsonb),
 'reviewers',coalesce((SELECT jsonb_agg(jsonb_build_object('id',m.user_id::text,'name',u.display_name)) FROM agency_platform.memberships m JOIN public.portal_users u ON u.id=m.user_id
 WHERE m.agency_id=target AND m.role='agency_admin' AND m.is_active AND NOT EXISTS(SELECT 1 FROM public.portal_internal_users i WHERE i.user_id=m.user_id)),'[]'::jsonb),
 'files',coalesce((SELECT jsonb_agg(jsonb_build_object('id',f.id,'clientId',f.client_id::text,'title',f.title)) FROM public.portal_client_library f
 JOIN agency_platform.client_ownership o ON o.client_id=f.client_id AND o.agency_id=target WHERE f.source_type='file'),'[]'::jsonb));
END $$;

CREATE FUNCTION agency_platform.specialist_admin_change(actor text,session_key text,target bigint,command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE p record; action text:=command->>'action'; op uuid:=(command->>'operation')::uuid; reason text:=command->>'reason';
 e agency_platform.specialist_engagements%ROWTYPE; x agency_platform.specialist_assignments%ROWTYPE;
 previous agency_platform.agency_admin_audit%ROWTYPE; person bigint; client bigint; reviewer bigint; actions text[]; files text[]; result jsonb; expiry timestamptz;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('agency-admin:'||target,13));
 SELECT * INTO STRICT p FROM agency_platform.agency_admin_actor(actor,session_key,target);
 IF p.role<>'agency_admin' THEN RAISE EXCEPTION 'Agency approval required' USING ERRCODE='42501'; END IF;
 IF op IS NULL OR length(trim(coalesce(reason,''))) NOT BETWEEN 3 AND 200 THEN RAISE EXCEPTION 'Reason required' USING ERRCODE='22023'; END IF;
 SELECT * INTO previous FROM agency_platform.agency_admin_audit WHERE operation=op;
 IF FOUND THEN
  IF previous.agency_id<>target OR previous.actor_id<>p.person OR previous.details->'command' IS DISTINCT FROM command THEN RAISE EXCEPTION 'Operation conflict' USING ERRCODE='40001'; END IF;
  RETURN previous.details->'result';
 END IF;
 IF action='engagement.create' THEN
  IF nullif(command->>'account','') IS NOT NULL THEN
   SELECT id INTO person FROM public.portal_users u WHERE external_id=command->>'account' AND NOT EXISTS(SELECT 1 FROM public.portal_internal_users i WHERE i.user_id=u.id) FOR SHARE;
   IF person IS NULL THEN RAISE EXCEPTION 'Specialist account unavailable' USING ERRCODE='22023'; END IF;
  END IF;
  INSERT INTO agency_platform.specialist_engagements(id,agency_id,user_id,reference,created_by) VALUES(op,target,person,command->>'reference',p.person);
 ELSIF action='engagement.link' THEN
  SELECT * INTO e FROM agency_platform.specialist_engagements WHERE id=(command->>'id')::uuid AND agency_id=target AND status='active' FOR UPDATE;
  IF NOT FOUND OR e.user_id IS NOT NULL THEN RAISE EXCEPTION 'Unlinked engagement unavailable' USING ERRCODE='42501'; END IF;
  SELECT id INTO person FROM public.portal_users u WHERE external_id=command->>'account' AND NOT EXISTS(SELECT 1 FROM public.portal_internal_users i WHERE i.user_id=u.id) FOR SHARE;
  IF person IS NULL THEN RAISE EXCEPTION 'Specialist account unavailable' USING ERRCODE='22023'; END IF;
  UPDATE agency_platform.specialist_engagements SET user_id=person WHERE id=e.id;
 ELSIF action='engagement.end' THEN
  SELECT * INTO e FROM agency_platform.specialist_engagements WHERE id=(command->>'id')::uuid AND agency_id=target FOR UPDATE;
  IF NOT FOUND OR e.status<>'active' THEN RAISE EXCEPTION 'Engagement unavailable' USING ERRCODE='42501'; END IF;
  UPDATE agency_platform.specialist_engagements SET status='ended' WHERE id=e.id;
  UPDATE agency_platform.specialist_assignments SET status='revoked',revision=revision+1 WHERE engagement_id=e.id AND status='active';
 ELSIF action IN ('assignment.create','assignment.replace') THEN
  SELECT * INTO e FROM agency_platform.specialist_engagements WHERE id=(command->>'engagementId')::uuid AND agency_id=target AND status='active' FOR SHARE;
  IF NOT FOUND OR e.user_id IS NULL OR EXISTS(SELECT 1 FROM public.portal_internal_users i WHERE i.user_id=e.user_id) THEN RAISE EXCEPTION 'Engagement unavailable' USING ERRCODE='42501'; END IF;
  client:=(command->>'clientId')::bigint;reviewer:=(command->>'reviewOwner')::bigint;expiry:=(command->>'expiresAt')::timestamptz;
  PERFORM 1 FROM agency_platform.client_ownership o JOIN public.portal_clients c ON c.id=o.client_id AND c.portal_enabled WHERE o.agency_id=target AND o.client_id=client FOR SHARE OF o,c;
  IF NOT FOUND THEN RAISE EXCEPTION 'Client unavailable' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM agency_platform.memberships m WHERE m.agency_id=target AND m.user_id=reviewer AND m.is_active AND m.role='agency_admin' FOR SHARE;
  IF NOT FOUND OR expiry IS NULL OR expiry<=clock_timestamp() OR expiry>now()+interval '90 days'
   OR EXISTS(SELECT 1 FROM public.portal_internal_users i WHERE i.user_id=reviewer) THEN RAISE EXCEPTION 'Approval scope unavailable' USING ERRCODE='42501'; END IF;
  SELECT array_agg(value) INTO actions FROM jsonb_array_elements_text(command->'actions');
  SELECT coalesce(array_agg(value),'{}'::text[]) INTO files FROM jsonb_array_elements_text(command->'fileIds');
  IF EXISTS(SELECT 1 FROM unnest(files) candidate(file_id) WHERE NOT EXISTS(SELECT 1 FROM public.portal_client_library f WHERE f.id=candidate.file_id AND f.client_id=client AND f.source_type='file')) THEN RAISE EXCEPTION 'File scope unavailable' USING ERRCODE='42501'; END IF;
  INSERT INTO agency_platform.memberships(agency_id,user_id,role,is_active) VALUES(target,e.user_id,'client_user',true) ON CONFLICT DO NOTHING;
  PERFORM 1 FROM agency_platform.memberships WHERE agency_id=target AND user_id=e.user_id AND is_active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Agency membership revoked' USING ERRCODE='42501'; END IF;
  IF action='assignment.replace' THEN
   SELECT * INTO x FROM agency_platform.specialist_assignments WHERE id=(command->>'id')::uuid AND agency_id=target AND status='active' FOR UPDATE;
   IF NOT FOUND OR x.client_id<>client OR x.revision::text IS DISTINCT FROM command->>'revision' THEN RAISE EXCEPTION 'Assignment changed' USING ERRCODE='40001'; END IF;
   UPDATE agency_platform.specialist_assignments SET status='replaced',revision=revision+1 WHERE id=x.id;
  END IF;
  INSERT INTO agency_platform.specialist_assignments(id,agency_id,client_id,engagement_id,user_id,work_type,actions,file_ids,role_label,responsibilities,deliverables,handoff,review_owner,approved_by,expires_at)
  VALUES(op,target,client,e.id,e.user_id,command->>'workType',actions,files,command->>'role',command->>'responsibilities',command->>'deliverables',command->>'handoff',reviewer,p.person,expiry);
 ELSIF action='assignment.revoke' THEN
  SELECT * INTO x FROM agency_platform.specialist_assignments WHERE id=(command->>'id')::uuid AND agency_id=target FOR UPDATE;
  IF NOT FOUND OR x.status<>'active' OR x.revision::text IS DISTINCT FROM command->>'revision' THEN RAISE EXCEPTION 'Assignment changed' USING ERRCODE='40001'; END IF;
  UPDATE agency_platform.specialist_assignments SET status='revoked',revision=revision+1 WHERE id=x.id;
 ELSE RAISE EXCEPTION 'Unsupported action' USING ERRCODE='22023'; END IF;
 result:=jsonb_build_object('id',op,'saved',true);
 INSERT INTO agency_platform.agency_admin_audit(operation,agency_id,client_id,actor_id,action,reason,details)
 VALUES(op,target,client,p.person,action,reason,jsonb_build_object('command',command,'result',result));
 RETURN result;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA agency_platform FROM PUBLIC;
