-- Explicit optional Supabase Storage boundary, approved separately from PostgreSQL.
-- Run with a reviewed storage-owner operator; do not change Supabase Auth.
DO $$
DECLARE bucket text:=current_setting('aoc.document_bucket'); policy_name text:='aoc_private_documents_'||substr(md5(current_setting('aoc.document_bucket')),1,12);
BEGIN
 IF to_regclass('storage.objects') IS NULL THEN RAISE EXCEPTION 'Supabase Storage schema required';END IF;
 -- Transactional replacement also repairs an unexpected existing definition.
 EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects',policy_name);
 EXECUTE format('CREATE POLICY %I ON storage.objects AS RESTRICTIVE FOR ALL TO PUBLIC USING(bucket_id<>%L) WITH CHECK(bucket_id<>%L)',policy_name,bucket,bucket);

END $$;
