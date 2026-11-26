"""PostgreSQL connections compatible with transaction-mode poolers."""
import asyncio
from contextlib import asynccontextmanager

import psycopg
from psycopg.rows import dict_row

QUERY_TIMEOUT_MS = 10_000


class PortalConnection(psycopg.AsyncConnection):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._transaction_lock = asyncio.Lock()
        self._transaction_owner = None

    @asynccontextmanager
    async def transaction(self, savepoint_name=None, force_rollback=False):
        # ChatKit's event consumer and agent/tool tasks share this connection.
        # Psycopg serializes SQL statements, not complete transaction scopes:
        # overlapping tasks otherwise exit savepoints in the wrong order.
        # Only the owning Task may nest; child tasks must acquire their own turn.
        owner = asyncio.current_task()
        acquired = self._transaction_owner is not owner
        if acquired:
            await self._transaction_lock.acquire()
            self._transaction_owner = owner
        try:
            async with super().transaction(savepoint_name, force_rollback) as transaction:
                yield transaction
        finally:
            if acquired:
                self._transaction_owner = None
                self._transaction_lock.release()

    async def execute(self, query, params=None, *, prepare=None, binary=False):
        # Transaction poolers reject statement_timeout as a startup option.
        # A transaction-local setting bounds the query on PostgreSQL itself and
        # is reset before this pooled server connection is used by another request.
        async with self.transaction():
            await super().execute("SELECT set_config('statement_timeout', %s, true)",
                                  (str(QUERY_TIMEOUT_MS),))
            return await super().execute(query, params, prepare=prepare, binary=binary)


async def connect_database(dsn):
    return await PortalConnection.connect(
        dsn, autocommit=True, row_factory=dict_row, connect_timeout=8,
        prepare_threshold=None,
    )
