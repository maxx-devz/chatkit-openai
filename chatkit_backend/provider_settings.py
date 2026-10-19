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
        cursor = await db.execute("""SELECT c.provider,c.encrypted_key,s.model,(a.provider=c.provider) AS active
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
        keys = {row["provider"]: unseal_provider_key(row["provider"], row["encrypted_key"], secret) for row in rows}
    except Exception as error:
        raise ProviderSettingsError("provider_credentials_unreadable") from error
    router = active["provider"] == "openrouter"
    return ProviderConfig(active["provider"], "OpenRouter" if router else "OpenAI", keys[active["provider"]],
                          OPENROUTER_BASE_URL if router else None, active["model"],
                          {"X-OpenRouter-Title": "Always Open Commerce Portal"} if router else {}, keys.get("openai", ""))


async def close_provider_clients(context):
    for attribute in ("ai_client", "hosted_client"):
        client = getattr(context, attribute, None)
        if client is not None:
            await client.close()
            setattr(context, attribute, None)
