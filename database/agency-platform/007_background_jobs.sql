-- Existing resource leases still own cursors/results. This ledger fences workers,
-- bounds automatic retries and enforces one shared capacity budget per agency.
CREATE TABLE agency_platform.job_runs (
 kind text NOT NULL CHECK(kind IN ('hubstaff','source','report')),
 resource text NOT NULL,
 agency_id bigint NOT NULL REFERENCES agency_platform.agencies(id),
 client_id bigint,
 version text NOT NULL,
 token uuid,
 lease_until timestamptz,
 attempted_at timestamptz NOT NULL DEFAULT now(),
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 failures integer NOT NULL DEFAULT 0 CHECK(failures BETWEEN 0 AND 5),
 failure_code text CHECK(failure_code IN ('job_failed','cancelled')),
 PRIMARY KEY(kind,resource),
 FOREIGN KEY(agency_id,client_id) REFERENCES agency_platform.client_ownership(agency_id,client_id)
);
CREATE INDEX job_runs_capacity ON agency_platform.job_runs(agency_id,lease_until) WHERE token IS NOT NULL;
ALTER TABLE agency_platform.job_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_platform.job_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_control ON agency_platform.job_runs TO aoc_agency_owner USING(true) WITH CHECK(true);

-- Resolve ownership from live records, never from a supplied agency ID. The
-- installed release still permits only AOC's connections (Stage 11 stays shut).
CREATE FUNCTION agency_platform.job_scope(kind text,item text,actor text,session_key text,selected bigint)
RETURNS TABLE(agency_id bigint,client_id bigint,version text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE owning bigint; target bigint; person bigint; stamp text; site uuid;
BEGIN
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

CREATE FUNCTION agency_platform.claim_job(kind text,item text,actor text,session_key text,selected bigint,claim uuid,manual boolean)
RETURNS TABLE(agency_id bigint,client_id bigint,version text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE scope record; old agency_platform.job_runs%ROWTYPE;
BEGIN
 SELECT * INTO STRICT scope FROM agency_platform.job_scope(kind,item,actor,session_key,selected);
 -- Serializes admission across processes and job kinds, not provider work.
 PERFORM pg_advisory_xact_lock(hashtextextended('agency-jobs:'||scope.agency_id,10));
 SELECT * INTO old FROM agency_platform.job_runs j WHERE j.kind=claim_job.kind AND j.resource=item FOR UPDATE;
 IF FOUND AND (old.agency_id IS DISTINCT FROM scope.agency_id OR old.client_id IS DISTINCT FROM scope.client_id) THEN
   RAISE EXCEPTION 'Job access denied' USING ERRCODE='42501';
 END IF;
 IF old.token IS NOT NULL AND old.lease_until>clock_timestamp() THEN RETURN; END IF;
 IF old.version=scope.version AND NOT manual AND old.failures>=5 THEN
   RAISE EXCEPTION 'Job paused after repeated failures; use the authorized retry control' USING ERRCODE='55000';
 END IF;
 IF old.version=scope.version AND NOT manual AND old.next_attempt_at>clock_timestamp() THEN RETURN; END IF;
 IF (SELECT count(*) FROM agency_platform.job_runs j WHERE j.agency_id=scope.agency_id AND j.token IS NOT NULL
     AND j.lease_until>clock_timestamp())>=5 THEN RETURN; END IF;
 INSERT INTO agency_platform.job_runs AS j(kind,resource,agency_id,client_id,version,token,lease_until)
   VALUES(kind,item,scope.agency_id,scope.client_id,scope.version,claim,clock_timestamp()+interval '150 seconds')
 ON CONFLICT ON CONSTRAINT job_runs_pkey DO UPDATE SET token=claim,lease_until=EXCLUDED.lease_until,attempted_at=clock_timestamp(),
   version=scope.version,failures=CASE WHEN manual OR j.version<>scope.version THEN 0 ELSE j.failures END;
 RETURN QUERY SELECT scope.agency_id,scope.client_id,scope.version;
END $$;

CREATE FUNCTION agency_platform.check_job(kind text,item text,claim uuid,actor text,session_key text,selected bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE scope record;
BEGIN
 SELECT * INTO STRICT scope FROM agency_platform.job_scope(kind,item,actor,session_key,selected);
 PERFORM 1 FROM agency_platform.job_runs j WHERE j.kind=check_job.kind AND j.resource=item AND j.token=claim
   AND j.lease_until>clock_timestamp() AND j.agency_id=scope.agency_id AND j.client_id IS NOT DISTINCT FROM scope.client_id
   AND j.version=scope.version FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Job expired or cancelled' USING ERRCODE='42501'; END IF;
END $$;

-- Token capability can release only its own lease, even after authority is lost.
-- No result, ownership or caller-provided failure text can be written here.
CREATE FUNCTION agency_platform.finish_job(kind text,item text,claim uuid,outcome text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 UPDATE agency_platform.job_runs j SET token=NULL,lease_until=NULL,
   failures=CASE WHEN outcome='ok' THEN 0 WHEN outcome='cancelled' THEN failures ELSE least(5,failures+1) END,
   failure_code=CASE WHEN outcome='ok' THEN NULL WHEN outcome='cancelled' THEN 'cancelled' ELSE 'job_failed' END,
   next_attempt_at=clock_timestamp()+make_interval(secs=>CASE WHEN outcome='ok' AND kind='report' THEN 0 WHEN outcome='ok' THEN 10 WHEN outcome='cancelled' THEN 12
     ELSE least(300,30*power(2,failures))::integer END)
 WHERE j.kind=finish_job.kind AND j.resource=item AND j.token=claim
$$;
REVOKE ALL ON FUNCTION agency_platform.job_scope(text,text,text,text,bigint),
 agency_platform.claim_job(text,text,text,text,bigint,uuid,boolean),agency_platform.check_job(text,text,uuid,text,text,bigint),
 agency_platform.finish_job(text,text,uuid,text) FROM PUBLIC;

CREATE FUNCTION agency_platform.retry_job(kind text,item text,actor text,session_key text,selected bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE scope record;
BEGIN
 SELECT * INTO STRICT scope FROM agency_platform.job_scope(kind,item,actor,session_key,selected);
 -- Register trusted ownership when a queue/report is created, before any worker.
 INSERT INTO agency_platform.job_runs(kind,resource,agency_id,client_id,version)
   VALUES(kind,item,scope.agency_id,scope.client_id,scope.version) ON CONFLICT ON CONSTRAINT job_runs_pkey DO NOTHING;
 IF EXISTS(SELECT 1 FROM agency_platform.job_runs j WHERE j.kind=retry_job.kind AND j.resource=item
   AND (j.agency_id IS DISTINCT FROM scope.agency_id OR j.client_id IS DISTINCT FROM scope.client_id)) THEN
   RAISE EXCEPTION 'Job access denied' USING ERRCODE='42501';
 END IF;
 UPDATE agency_platform.job_runs j SET failures=0,next_attempt_at=clock_timestamp(),failure_code=NULL
  WHERE j.kind=retry_job.kind AND j.resource=item AND (j.token IS NULL OR j.lease_until<clock_timestamp());
END $$;
CREATE FUNCTION agency_platform.job_candidates(job_kind text,maximum integer)
RETURNS TABLE(resource text) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 WITH candidates AS (
   SELECT c.id::text resource,o.agency_id,md5(c.hubstaff_project_url) version FROM public.portal_clients c
    JOIN agency_platform.client_ownership o ON o.client_id=c.id
    WHERE job_kind='hubstaff' AND c.portal_enabled AND c.ai_enabled
      AND btrim(c.hubstaff_project_url) ~ '^https://tasks[.]hubstaff[.]com/app/organizations/[1-9][0-9]*/projects/[1-9][0-9]*/?$'
   UNION ALL
   SELECT c.owner_id::text,b.agency_id,md5(concat_ws('|',b.generation,c.connected_at,c.oauth_client_id,c.root_folder_id))
    FROM public.portal_drive_source_connections c JOIN public.portal_admins p ON p.user_id=c.owner_id AND p.is_active
    JOIN agency_platform.connection_bindings b ON b.service='drive' AND b.resource=c.owner_id::text AND b.owner_id=c.owner_id
    WHERE job_kind='source'
 ), due AS (
  SELECT c.resource,c.agency_id,j.attempted_at FROM candidates c
  JOIN agency_platform.agencies a ON a.id=c.agency_id AND a.is_active
  JOIN agency_platform.backfill_state s ON s.aoc_agency_id=a.id AND s.active
  LEFT JOIN agency_platform.job_runs j ON j.kind=job_kind AND j.resource=c.resource
  WHERE (j.token IS NULL OR j.lease_until<clock_timestamp())
    AND (j.kind IS NULL OR j.version<>c.version OR (j.failures<5 AND j.next_attempt_at<=clock_timestamp()))
 ), fair AS (
  SELECT d.*,row_number() OVER(PARTITION BY d.agency_id ORDER BY d.attempted_at NULLS FIRST,d.resource) turn FROM due d
 ) SELECT f.resource FROM fair f ORDER BY f.turn,f.attempted_at NULLS FIRST,f.agency_id,f.resource LIMIT greatest(1,least(100,maximum))
$$;
REVOKE ALL ON FUNCTION agency_platform.retry_job(text,text,text,text,bigint),agency_platform.job_candidates(text,integer) FROM PUBLIC;
