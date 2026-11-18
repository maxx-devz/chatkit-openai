-- Existing publications are adopted only through the reviewed Stage 04 registry.
-- Subsequent content/configuration revisions remain held for Stage 20B.
CREATE TABLE agency_platform.source_revision_approvals (
  owner_id bigint NOT NULL,
  audience text NOT NULL,
  agency_id bigint REFERENCES agency_platform.agencies(id),
  client_id bigint,
  publication jsonb NOT NULL,
  binding text NOT NULL,
  corpus_revision text NOT NULL,
  connection jsonb NOT NULL,
  revision text NOT NULL,
  PRIMARY KEY(owner_id,audience),
  FOREIGN KEY(agency_id,client_id) REFERENCES agency_platform.client_ownership(agency_id,client_id)
);
ALTER TABLE agency_platform.source_revision_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_platform.source_revision_approvals FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_control ON agency_platform.source_revision_approvals TO aoc_agency_owner USING(true) WITH CHECK(true);

CREATE FUNCTION agency_platform.source_publication_config(p public.portal_source_publications)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
 SELECT to_jsonb(p)-'updated_at'-'enabled'
$$;
CREATE FUNCTION agency_platform.source_connection_config(c public.portal_drive_source_connections)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
 SELECT jsonb_build_object('email',c.google_email,'subject',c.google_subject,'client',c.oauth_client_id,
   'root',c.root_folder_id,'connected',c.connected_at)
$$;
INSERT INTO agency_platform.source_revision_approvals
 SELECT p.owner_id,p.audience,o.agency_id,p.client_id,agency_platform.source_publication_config(p),
   i.binding,i.sync_info->>'corpusRevision',agency_platform.source_connection_config(c),
   md5((agency_platform.source_publication_config(p)||jsonb_build_object('binding',i.binding,
     'corpus',i.sync_info->>'corpusRevision','connection',agency_platform.source_connection_config(c)))::text)
 FROM public.portal_source_publications p
 JOIN agency_platform.legacy_ownership o ON o.relation_name='portal_source_publications'
   AND o.record_key=jsonb_build_object('owner_id',p.owner_id::text,'audience',p.audience)
 JOIN public.portal_prepared_source_indexes i ON i.owner_id=p.owner_id
 JOIN public.portal_drive_source_connections c ON c.owner_id=p.owner_id
 WHERE p.enabled AND i.binding IS NOT NULL AND i.sync_info->>'corpusRevision' IS NOT NULL
   AND ((p.audience='admin' AND o.scope_kind='platform_private')
     OR (p.audience='clients' AND o.scope_kind='agency' AND o.agency_id IS NOT NULL)
     OR (p.client_id IS NOT NULL AND o.scope_kind='client' AND o.client_id=p.client_id));

CREATE FUNCTION agency_platform.source_approval(owner_key bigint,audience_key text,client_key bigint,admin_key bigint)
RETURNS TABLE(revision text,agency_id bigint) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT v.revision,v.agency_id FROM agency_platform.source_revision_approvals v
 JOIN public.portal_source_publications p ON (p.owner_id,p.audience)=(v.owner_id,v.audience)
 JOIN public.portal_prepared_source_indexes i ON i.owner_id=p.owner_id
 JOIN public.portal_drive_source_connections c ON c.owner_id=p.owner_id
 JOIN public.portal_admins a ON a.user_id=p.owner_id AND a.is_active
 WHERE p.owner_id=owner_key AND p.audience=audience_key AND p.enabled
   AND agency_platform.source_publication_config(p)=v.publication
   AND i.binding=v.binding AND i.sync_info->>'corpusRevision'=v.corpus_revision
   AND agency_platform.source_connection_config(c)=v.connection
   AND i.failure_code IS NULL AND i.checked_at>now()-interval '15 minutes'
   AND ((client_key IS NOT NULL AND EXISTS(
       SELECT 1 FROM agency_platform.client_ownership o JOIN agency_platform.agencies g ON g.id=o.agency_id AND g.is_active
       WHERE o.client_id=client_key AND o.agency_id=v.agency_id
         AND (v.client_id IS NULL OR v.client_id=client_key)))
     OR (client_key IS NULL AND admin_key IS NOT NULL AND
       ((p.audience='admin' AND owner_key=admin_key AND v.agency_id IS NULL)
        OR (p.audience='clients' AND EXISTS(SELECT 1 FROM agency_platform.backfill_state s
          WHERE s.active AND s.aoc_agency_id=v.agency_id)))))
$$;
CREATE FUNCTION agency_platform.source_scope(owner_key bigint,audience_key text,client_key bigint,admin_key bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM agency_platform.source_revision_approvals v
   WHERE v.owner_id=owner_key AND v.audience=audience_key AND
   ((client_key IS NOT NULL AND EXISTS(SELECT 1 FROM agency_platform.client_ownership o
      JOIN agency_platform.agencies a ON a.id=o.agency_id AND a.is_active
      WHERE o.client_id=client_key AND o.agency_id=v.agency_id AND (v.client_id IS NULL OR v.client_id=client_key)))
    OR (client_key IS NULL AND admin_key IS NOT NULL AND
       ((v.audience='admin' AND v.owner_id=admin_key) OR
        (v.audience='clients' AND EXISTS(SELECT 1 FROM agency_platform.backfill_state s WHERE s.active AND s.aoc_agency_id=v.agency_id))))))
$$;
REVOKE ALL ON FUNCTION agency_platform.source_publication_config(public.portal_source_publications),
 agency_platform.source_connection_config(public.portal_drive_source_connections),
 agency_platform.source_approval(bigint,text,bigint,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION agency_platform.source_scope(bigint,text,bigint,bigint) FROM PUBLIC;
