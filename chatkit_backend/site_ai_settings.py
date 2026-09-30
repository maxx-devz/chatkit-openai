"""Read the same admin-controlled chat model as the Next.js application."""
from psycopg.errors import UndefinedTable
from ai_provider import provider_config


async def load_site_model(db):
    provider = provider_config()
    try:
        cursor = await db.execute(
            "SELECT model FROM portal_site_ai_settings WHERE provider=%s", (provider.name,))
        row = await cursor.fetchone()
    except UndefinedTable:
        return provider.model
    return row["model"] if row else provider.model
