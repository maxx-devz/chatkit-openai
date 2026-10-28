-- Model selections, encrypted credentials, and one site-wide active provider.
CREATE TABLE IF NOT EXISTS portal_site_ai_settings (
    provider TEXT PRIMARY KEY CHECK (provider IN ('openai', 'openrouter')),
    model TEXT NOT NULL CHECK (length(model) BETWEEN 1 AND 200),
    updated_by TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE portal_site_ai_settings ADD COLUMN IF NOT EXISTS generation_options JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS portal_ai_credentials (
    provider TEXT PRIMARY KEY CHECK (provider IN ('openai', 'openrouter')),
    encrypted_key TEXT NOT NULL,
    key_suffix TEXT NOT NULL,
    updated_by TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS portal_ai_active_provider (
    id INTEGER PRIMARY KEY CHECK (id=1),
    provider TEXT NOT NULL REFERENCES portal_ai_credentials(provider),
    updated_by TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
