"""Database connections compatible with Neon's transaction pooler."""
import psycopg
from psycopg.rows import dict_row

QUERY_TIMEOUT_MS = 10_000


class PortalConnection(psycopg.AsyncConnection):
    async def execute(self, query, params=None, *, prepare=None, binary=False):
        # PgBouncer rejects statement_timeout as a connection startup option.
        # A transaction-local setting bounds the query on PostgreSQL itself and
        # is reset before this pooled server connection is used by another request.
        async with self.transaction():
            await super().execute("SELECT set_config('statement_timeout', %s, true)",
                                  (str(QUERY_TIMEOUT_MS),))
            return await super().execute(query, params, prepare=prepare, binary=binary)


async def connect_database(dsn):
    return await PortalConnection.connect(
        dsn, autocommit=True, row_factory=dict_row, connect_timeout=8,
    )
