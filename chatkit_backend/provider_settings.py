"""Decrypt admin settings server-side; never attach credentials to model input."""
import base64
import hashlib
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from psycopg.errors import UndefinedTable
from ai_provider import ProviderConfig, provider_config, OPENROUTER_BASE_URL
from site_ai_settings import load_site_model


class ProviderSettingsError(ValueError):
    """Safe configuration diagnosis; never includes encrypted or clear keys."""
    def __init__(self, code):
        self.code = code
        super().__init__(code)


def unseal_provider_key(provider, value, secret):
    if provider not in ("openai", "openrouter") or len(secret) < 32:
        raise ValueError("Provider encryption is not configured")
    version, iv, tag, ciphertext = value.split(".")
    if version != "v1":
        raise ValueError("Invalid encrypted provider key")
    def decode(part):
        return base64.urlsafe_b64decode(part + "=" * (-len(part) % 4))
    key = hashlib.sha256(secret.encode()).digest()
    return AESGCM(key).decrypt(decode(iv), decode(ciphertext) + decode(tag),
                              f"aoc-provider:{provider}:v1".encode()).decode()


async def load_provider_settings(db):
    try:
        cursor = await db.execute("""SELECT c.provider,c.encrypted_key,s.model,to_jsonb(s)->'generation_options' AS generation_options,to_jsonb(c)->'reporting_binding' AS reporting_binding,(a.provider=c.provider) AS active
            FROM portal_ai_credentials c LEFT JOIN portal_site_ai_settings s ON s.provider=c.provider
            LEFT JOIN portal_ai_active_provider a ON a.id=1""")
        rows = await cursor.fetchall()
    except UndefinedTable:
        rows = []
    active = next((row for row in rows if row["active"]), None)
    if not active:
        fallback = provider_config()
        return ProviderConfig(fallback.name, fallback.label, fallback.api_key, fallback.base_url,
                              await load_site_model(db), fallback.default_headers,
                              os.getenv("OPENAI_API_KEY", "") if not os.getenv("OPENAI_API_KEY", "").startswith("sk-or-v1-") else "")
    secret = os.getenv("PROVIDER_SETTINGS_SECRET", "")
    if len(secret) < 32:
        raise ProviderSettingsError("provider_encryption_missing")
    try:
        active_key = unseal_provider_key(active["provider"], active["encrypted_key"], secret)
    except Exception as error:
        raise ProviderSettingsError("provider_credentials_unreadable") from error
    router = active["provider"] == "openrouter"
    # Only the selected provider is required for chat. An old inactive key must
    # not prevent a readable active key from being used. Never substitute an
    # environment key or another provider when the selected credential fails.
    openai_key = active_key if not router else ""
    if router:
        hosted = next((row for row in rows if row["provider"] == "openai"), None)
        if hosted:
            try:
                openai_key = unseal_provider_key("openai", hosted["encrypted_key"], secret)
            except Exception:
                # Hosted-only tools already check has_openai_hosted_key and
                # remain unavailable; ordinary OpenRouter chat can continue.
                openai_key = ""
    headers = {"X-OpenRouter-Title": "Always Open Commerce Portal"} if router else {}
    binding = active.get("reporting_binding") or {}
    if not router and binding.get("chatKeyHash") == hashlib.sha256(active_key.encode()).hexdigest():
        import re
        if re.fullmatch(r"proj_[A-Za-z0-9_-]{1,160}", binding.get("projectId", "")) and re.fullmatch(r"org-[A-Za-z0-9_-]{1,160}", binding.get("organizationId", "")):
            headers = {"OpenAI-Organization": binding["organizationId"], "OpenAI-Project": binding["projectId"]}
    identity = {}
    if not router and binding.get("chatKeyHash") == hashlib.sha256(active_key.encode()).hexdigest():
        import re
        observed_organization = binding.get("chatOrganizationId")
        if not observed_organization and (binding.get("organizationMatch") == "verified" or binding.get("projectId")):
            observed_organization = binding.get("organizationId")
        for name, value in [("organizationId", observed_organization), ("projectId", binding.get("chatProjectId") or binding.get("projectId"))]:
            if isinstance(value, str) and re.fullmatch(r"org-[A-Za-z0-9_-]{1,160}" if name == "organizationId" else r"proj_[A-Za-z0-9_-]{1,160}", value):
                identity[name] = value
    return ProviderConfig(active["provider"], "OpenRouter" if router else "OpenAI", active_key,
                          OPENROUTER_BASE_URL if router else None, active["model"],
                          headers, openai_key,
                          active.get("generation_options") or {}, identity)


async def close_provider_clients(context):
    for attribute in ("ai_client", "hosted_client"):
        client = getattr(context, attribute, None)
        if client is not None:
            await client.close()
            setattr(context, attribute, None)
