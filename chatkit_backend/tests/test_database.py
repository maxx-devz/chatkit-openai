import sys
import unittest
from contextlib import asynccontextmanager
from pathlib import Path
from unittest.mock import AsyncMock, call, patch, sentinel

import psycopg
from psycopg.rows import dict_row

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from database import PortalConnection, connect_database


class DatabaseTests(unittest.IsolatedAsyncioTestCase):
    async def test_pooler_connection_does_not_send_unsupported_startup_options(self):
        async def pooler(dsn, **kwargs):
            if kwargs.get("options"):
                raise psycopg.OperationalError("unsupported startup parameter in options: statement_timeout")
            self.assertEqual(dsn, "test-database")
            self.assertTrue(kwargs["autocommit"])
            self.assertIs(kwargs["row_factory"], dict_row)
            self.assertEqual(kwargs["connect_timeout"], 8)
            return sentinel.connection

        with patch.object(PortalConnection, "connect", side_effect=pooler):
            self.assertIs(await connect_database("test-database"), sentinel.connection)

    async def test_timeout_is_transaction_local_and_cursor_survives_commit(self):
        events = []

        @asynccontextmanager
        async def transaction():
            events.append("begin")
            yield
            events.append("commit")

        async def execute(query, *args, **kwargs):
            events.append("timeout" if "set_config" in query else "query")
            return sentinel.cursor

        connection = object.__new__(PortalConnection)
        with patch.object(connection, "transaction", transaction), \
                patch.object(psycopg.AsyncConnection, "execute", side_effect=execute) as execute:
            self.assertIs(await connection.execute("SELECT %s", (7,)), sentinel.cursor)
            self.assertEqual(events, ["begin", "timeout", "query", "commit"])
            self.assertEqual(execute.await_args_list, [
                call("SELECT set_config('statement_timeout', %s, true)", ("10000",)),
                call("SELECT %s", (7,), prepare=None, binary=False),
            ])

    async def test_query_timeout_rolls_back_and_preserves_error_without_retry(self):
        events = []

        @asynccontextmanager
        async def transaction():
            try:
                yield
            except psycopg.errors.QueryCanceled:
                events.append("rollback")
                raise

        connection = object.__new__(PortalConnection)
        with patch.object(connection, "transaction", transaction), \
                patch.object(psycopg.AsyncConnection, "execute", new_callable=AsyncMock,
                    side_effect=[sentinel.cursor, psycopg.errors.QueryCanceled("statement timeout")]) as execute:
            with self.assertRaises(psycopg.errors.QueryCanceled):
                await connection.execute("SELECT pg_sleep(60)")
            self.assertEqual(events, ["rollback"])
            self.assertEqual(execute.await_count, 2)


if __name__ == "__main__":
    unittest.main()
