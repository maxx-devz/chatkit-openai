-- Deployment-wide provider configuration, never an agency/client credential grant.
-- No existing key, history or client credit is changed by this additive migration.
ALTER TABLE portal_ai_credentials ADD COLUMN IF NOT EXISTS encrypted_reporting_key TEXT;
ALTER TABLE portal_ai_credentials ADD COLUMN IF NOT EXISTS reporting_binding JSONB;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='portal_ai_reporting_pair_valid' AND conrelid='portal_ai_credentials'::regclass) THEN
  ALTER TABLE portal_ai_credentials ADD CONSTRAINT portal_ai_reporting_pair_valid CHECK (
   (encrypted_reporting_key IS NULL AND reporting_binding IS NULL) OR
   (provider='openai' AND encrypted_reporting_key IS NOT NULL AND length(encrypted_reporting_key)>30
    AND reporting_binding IS NOT NULL AND jsonb_typeof(reporting_binding)='object'
    AND COALESCE(reporting_binding->>'projectId','') ~ '^proj_[A-Za-z0-9_-]{1,160}$'
    AND COALESCE(reporting_binding->>'organizationId','') ~ '^org-[A-Za-z0-9_-]{1,160}$'
    AND COALESCE(reporting_binding->>'chatKeyHash','') ~ '^[a-f0-9]{64}$')
  );
 END IF;
END $$;
