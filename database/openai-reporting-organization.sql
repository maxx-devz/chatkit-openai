-- Preserve existing project-scoped pairs and permit explicit organization-wide pairs.
-- No existing record, credential, grant or credit is modified.
ALTER TABLE portal_ai_credentials DROP CONSTRAINT IF EXISTS portal_ai_reporting_pair_valid;
ALTER TABLE portal_ai_credentials ADD CONSTRAINT portal_ai_reporting_pair_valid CHECK (
 (encrypted_reporting_key IS NULL AND reporting_binding IS NULL) OR
 (provider='openai' AND encrypted_reporting_key IS NOT NULL AND length(encrypted_reporting_key)>30
  AND reporting_binding IS NOT NULL AND jsonb_typeof(reporting_binding)='object'
  AND COALESCE(reporting_binding->>'chatKeyHash','') ~ '^[a-f0-9]{64}$'
  AND ((COALESCE(reporting_binding->>'scope','')='organization'
        AND (reporting_binding->>'organizationId' IS NULL OR reporting_binding->>'organizationId' ~ '^org-[A-Za-z0-9_-]{1,160}$'))
       OR (COALESCE(reporting_binding->>'scope','')<>'organization'
           AND COALESCE(reporting_binding->>'projectId','') ~ '^proj_[A-Za-z0-9_-]{1,160}$'
           AND COALESCE(reporting_binding->>'organizationId','') ~ '^org-[A-Za-z0-9_-]{1,160}$')))
);
