-- Brand data is presentation owned by an agency, never client AI configuration.
CREATE FUNCTION agency_platform.brand_luminance(color text) RETURNS double precision
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
DECLARE channels double precision[]; i integer;
BEGIN
 IF color IS NULL OR color !~ '^#[a-fA-F0-9]{6}$' THEN RETURN NULL; END IF;
 channels:=ARRAY[get_byte(decode(substr(color,2),'hex'),0),get_byte(decode(substr(color,2),'hex'),1),get_byte(decode(substr(color,2),'hex'),2)]::double precision[];
 FOR i IN 1..3 LOOP channels[i]:=channels[i]/255; channels[i]:=CASE WHEN channels[i]<=0.04045 THEN channels[i]/12.92 ELSE power((channels[i]+0.055)/1.055,2.4) END; END LOOP;
 RETURN channels[1]*0.2126+channels[2]*0.7152+channels[3]*0.0722;
END $$;
CREATE FUNCTION agency_platform.brand_contrast(a text,b text) RETURNS double precision
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
 SELECT (greatest(agency_platform.brand_luminance(a),agency_platform.brand_luminance(b))+.05)/(least(agency_platform.brand_luminance(a),agency_platform.brand_luminance(b))+.05)
$$;
CREATE TABLE agency_platform.agency_branding (
 agency_id bigint PRIMARY KEY REFERENCES agency_platform.agencies(id), revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0),
 portal_name text NOT NULL CHECK(length(portal_name) BETWEEN 1 AND 80 AND portal_name !~ '[<>[:cntrl:]]'),
 report_name text NOT NULL CHECK(length(report_name) BETWEEN 1 AND 100 AND report_name !~ '[<>[:cntrl:]]'),
 legal_name text NOT NULL DEFAULT '' CHECK(length(legal_name)<=120 AND legal_name !~ '[<>[:cntrl:]]'),
 palette jsonb NOT NULL CHECK(palette ?& ARRAY['primary','onPrimary','background','text']
 AND (palette->>'primary') ~ '^#[a-fA-F0-9]{6}$' AND (palette->>'onPrimary') ~ '^#[a-fA-F0-9]{6}$'
 AND (palette->>'background') ~ '^#[a-fA-F0-9]{6}$' AND (palette->>'text') ~ '^#[a-fA-F0-9]{6}$'
 AND agency_platform.brand_contrast(palette->>'primary',palette->>'onPrimary')>=4.5
 AND agency_platform.brand_contrast(palette->>'background',palette->>'text')>=4.5
 AND jsonb_typeof(palette->'primary')='string' AND jsonb_typeof(palette->'onPrimary')='string' AND jsonb_typeof(palette->'background')='string' AND jsonb_typeof(palette->'text')='string'),
 powered_by boolean NOT NULL DEFAULT true,
 logo bytea CHECK(logo IS NULL OR (octet_length(logo) BETWEEN 8 AND 256000 AND encode(substring(logo FROM 1 FOR 8),'hex')='89504e470d0a1a0a')),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE agency_platform.agency_domains (
 hostname text PRIMARY KEY CHECK(hostname=lower(hostname) AND length(hostname)<=253 AND hostname ~ '^[a-z0-9][a-z0-9.-]*[a-z]$' AND position('..' IN hostname)=0),
 agency_id bigint NOT NULL REFERENCES agency_platform.agencies(id), generation bigint NOT NULL DEFAULT 0,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','verified','revoked')),
 verification jsonb NOT NULL DEFAULT '[]', project_id text, checked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE agency_platform.agency_branding ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_platform.agency_branding FORCE ROW LEVEL SECURITY;
ALTER TABLE agency_platform.agency_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_platform.agency_domains FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_control ON agency_platform.agency_branding TO aoc_agency_owner USING(true) WITH CHECK(true);
CREATE POLICY owner_control ON agency_platform.agency_domains TO aoc_agency_owner USING(true) WITH CHECK(true);

-- Deliberately public presentation projection. It contains no membership,
-- private settings, credential, domain proof, conversation or source data.
CREATE FUNCTION agency_platform.public_brand(slug text) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT jsonb_build_object('agencyId',a.id::text,'slug',a.slug,'portalName',coalesce(b.portal_name,a.display_name),
 'reportName',coalesce(b.report_name,a.display_name||' reports'),'legalName',coalesce(b.legal_name,''),
 'supportName',g.support_name,'supportEmail',g.support_email,'poweredBy',coalesce(b.powered_by,true),
 'palette',coalesce(b.palette,'{"primary":"#164e63","onPrimary":"#ffffff","background":"#f8fafc","text":"#172033"}'::jsonb),
 'revision',coalesce(b.revision,0)::text,'hasLogo',b.logo IS NOT NULL)
 FROM agency_platform.agencies a JOIN agency_platform.agency_governance g ON g.agency_id=a.id AND g.enabled
 LEFT JOIN agency_platform.agency_branding b ON b.agency_id=a.id WHERE a.slug=public_brand.slug AND a.is_active
$$;
CREATE FUNCTION agency_platform.brand_logo(slug text,revision bigint) RETURNS bytea
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT b.logo FROM agency_platform.agency_branding b JOIN agency_platform.agencies a ON a.id=b.agency_id AND a.is_active
 JOIN agency_platform.agency_governance g ON g.agency_id=a.id AND g.enabled
 WHERE a.slug=brand_logo.slug AND b.revision=brand_logo.revision
$$;
CREATE FUNCTION agency_platform.brand_view(actor text,session_key text,target bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE p record; slug text;
BEGIN
 SELECT * INTO p FROM agency_platform.agency_admin_actor(actor,session_key,target);
 SELECT a.slug INTO STRICT slug FROM agency_platform.agencies a WHERE a.id=target;
 RETURN jsonb_build_object('brand',agency_platform.public_brand(slug),'canManage',p.is_owner,
 'domains',CASE WHEN p.is_owner THEN coalesce((SELECT jsonb_agg(jsonb_build_object('hostname',d.hostname,'status',d.status,'generation',d.generation::text,'verification',d.verification)) FROM agency_platform.agency_domains d WHERE d.agency_id=target),'[]'::jsonb) ELSE '[]'::jsonb END);
END $$;
CREATE FUNCTION agency_platform.brand_save(actor text,session_key text,target bigint,command jsonb,logo_value bytea)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE p record; current_revision bigint; op uuid;
BEGIN
 SELECT * INTO p FROM agency_platform.agency_admin_actor(actor,session_key,target);
 IF NOT p.is_owner THEN RAISE EXCEPTION 'Agency owner required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('agency-admin:'||target,13));
 op:=(command->>'operation')::uuid;
 SELECT coalesce(b.revision,0) INTO current_revision FROM agency_platform.agencies a LEFT JOIN agency_platform.agency_branding b ON b.agency_id=a.id WHERE a.id=target;
 IF current_revision<>(command->>'revision')::bigint THEN RAISE EXCEPTION 'Brand changed' USING ERRCODE='40001'; END IF;
 IF command->>'logoAction' NOT IN ('keep','replace','remove') OR length(command->>'reason') NOT BETWEEN 3 AND 200 THEN RAISE EXCEPTION 'Invalid brand change' USING ERRCODE='22023'; END IF;
 INSERT INTO agency_platform.agency_branding(agency_id,portal_name,report_name,legal_name,palette,powered_by,logo,revision)
 VALUES(target,command->'settings'->>'portalName',command->'settings'->>'reportName',command->'settings'->>'legalName',command->'settings'->'palette',(command->'settings'->>'poweredBy')::boolean,
 CASE WHEN command->>'logoAction'='replace' THEN logo_value ELSE NULL END,1)
 ON CONFLICT(agency_id) DO UPDATE SET portal_name=EXCLUDED.portal_name,report_name=EXCLUDED.report_name,legal_name=EXCLUDED.legal_name,palette=EXCLUDED.palette,powered_by=EXCLUDED.powered_by,
 logo=CASE WHEN command->>'logoAction'='keep' THEN agency_branding.logo ELSE EXCLUDED.logo END,revision=agency_branding.revision+1,updated_at=now();
 UPDATE agency_platform.agency_governance SET support_name=command->'settings'->>'supportName',support_email=command->'settings'->>'supportEmail',revision=revision+1 WHERE agency_id=target;
 INSERT INTO agency_platform.agency_admin_audit(operation,agency_id,actor_id,action,reason,details)
 VALUES(op,target,p.person,'brand.update',command->>'reason',jsonb_build_object('revision',current_revision+1,'logoAction',command->>'logoAction'));
END $$;
CREATE FUNCTION agency_platform.domain_request(actor text,session_key text,target bigint,host text,op uuid,reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE p record; existing bigint;
BEGIN
 SELECT * INTO p FROM agency_platform.agency_admin_actor(actor,session_key,target);
 IF NOT p.is_owner OR length(reason) NOT BETWEEN 3 AND 200 THEN RAISE EXCEPTION 'Agency owner required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('domain:'||host,15));
 SELECT agency_id INTO existing FROM agency_platform.agency_domains WHERE hostname=host FOR UPDATE;
 IF FOUND AND existing<>target THEN RAISE EXCEPTION 'Domain unavailable' USING ERRCODE='23505'; END IF;
 INSERT INTO agency_platform.agency_domains(hostname,agency_id) VALUES(host,target)
 ON CONFLICT(hostname) DO UPDATE SET generation=agency_domains.generation+1,status='pending',verification='[]',checked_at=NULL,project_id=NULL;
 INSERT INTO agency_platform.agency_admin_audit(operation,agency_id,actor_id,action,reason,details)
 VALUES(op,target,p.person,'domain.request',reason,jsonb_build_object('hostname',host));
END $$;
CREATE FUNCTION agency_platform.domain_ticket(actor text,session_key text,host text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE row agency_platform.agency_domains%ROWTYPE;
BEGIN
 PERFORM * FROM agency_platform.console_actor(actor,session_key,true);
 SELECT d.* INTO row FROM agency_platform.agency_domains d JOIN agency_platform.agencies a ON a.id=d.agency_id AND a.is_active WHERE d.hostname=host AND d.status<>'revoked' FOR SHARE OF d,a;
 IF NOT FOUND THEN RAISE EXCEPTION 'Domain unavailable' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('hostname',row.hostname,'agencyId',row.agency_id::text,'generation',row.generation::text);
END $$;
CREATE FUNCTION agency_platform.domain_checked(actor text,session_key text,host text,target bigint,expected bigint,verified boolean,project text,proof jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 PERFORM * FROM agency_platform.console_actor(actor,session_key,true);
 PERFORM 1 FROM agency_platform.agencies WHERE id=target AND is_active FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Domain unavailable' USING ERRCODE='42501'; END IF;
 UPDATE agency_platform.agency_domains SET status=CASE WHEN verified THEN 'verified' ELSE 'pending' END,project_id=project,verification=proof,checked_at=clock_timestamp()
 WHERE hostname=host AND agency_id=target AND generation=expected AND status<>'revoked';
 IF NOT FOUND THEN RAISE EXCEPTION 'Domain scope changed' USING ERRCODE='40001'; END IF;
 INSERT INTO agency_platform.agency_admin_audit(agency_id,actor_id,action,reason,details)
 SELECT target,u.id,'domain.checked','Platform operator checked hosting ownership',jsonb_build_object('hostname',host,'verified',verified) FROM public.portal_users u WHERE u.external_id=actor;
END $$;
-- A branded invitation page must agree with the invitation's immutable agency.
CREATE FUNCTION agency_platform.accept_brand_invitation(actor text,session_key text,requested uuid,hash text,slug text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 PERFORM 1 FROM agency_platform.agency_invitations i JOIN agency_platform.agencies a ON a.id=i.agency_id AND a.is_active
 WHERE i.id=requested AND a.slug=accept_brand_invitation.slug FOR SHARE OF i,a;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invitation unavailable' USING ERRCODE='42501'; END IF;
 PERFORM agency_platform.accept_invitation_link(actor,session_key,requested,hash);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA agency_platform FROM PUBLIC;
