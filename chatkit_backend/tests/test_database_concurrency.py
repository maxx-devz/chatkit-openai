"""Real concurrency regressions; only explicitly disposable loopback PostgreSQL."""
import asyncio
from datetime import datetime, timezone
import os
from pathlib import Path
import re
import sys
import unittest
from unittest.mock import patch
from urllib.parse import urlparse
from uuid import uuid4

import psycopg
from psycopg.pq import TransactionStatus
from chatkit.store import NotFoundError
from chatkit.types import ThreadMetadata

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from database import connect_database
from store import Context, PostgresStore

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

TEST = os.getenv("CLIENT_PLANS_TEST_DATABASE_URL", "")
OPERATOR = os.getenv("CLIENT_PLANS_TEST_OPERATOR_URL", "")


@unittest.skipUnless(TEST and OPERATOR, "Disposable PostgreSQL configuration not supplied")
class DatabaseConcurrencyTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        for value in (TEST, OPERATOR):
            url = urlparse(value)
            if url.hostname != "127.0.0.1" or not re.fullmatch(r"/aoc_documents_[a-f0-9]{10}", url.path):
                raise AssertionError("An explicitly disposable loopback database is required")
        self.db = await connect_database(TEST)
        self.operator = await connect_database(OPERATOR)
        identity = await (await self.db.execute(
            "SELECT current_user AS name, rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user"
        )).fetchone()
        self.assertEqual(identity["name"], "aoc_document_runtime")
        self.assertFalse(identity["rolsuper"] or identity["rolbypassrls"])
        self.tasks = []
        self.context = Context(self.db, "1", "101", "", {})
        self.store = PostgresStore()

    async def asyncTearDown(self):
        for task in self.tasks:
            if not task.done():
                task.cancel()
        await asyncio.gather(*self.tasks, return_exceptions=True)
        await self.db.close()
        await self.operator.close()

    def start(self, coroutine):
        task = asyncio.create_task(coroutine)
        self.tasks.append(task)
        return task

    def thread(self):
        return ThreadMetadata(id="thr_" + uuid4().hex, created_at=datetime.now(timezone.utc))

    async def assert_healthy(self):
        self.assertEqual(self.db.info.transaction_status, TransactionStatus.IDLE)
        self.assertEqual((await (await self.db.execute("SELECT 42 AS value")).fetchone())["value"], 42)

    async def test_concurrent_queries_keep_independent_cursors_and_finish_idle(self):
        async def query(number):
            cursor = await self.db.execute("SELECT %s::int AS value, pg_sleep(0.015)", (number,))
            await asyncio.sleep(0)
            return (await cursor.fetchone())["value"]
        values = await asyncio.gather(*(self.start(query(number)) for number in range(12)))
        self.assertEqual(values, list(range(12)))
        await self.assert_healthy()

    async def test_chatkit_save_in_child_task_waits_for_outer_rollback_and_keeps_scope(self):
        entered, attempted, release = asyncio.Event(), asyncio.Event(), asyncio.Event()
        rolled_back, committed = self.thread(), self.thread()

        async def owner():
            async with self.db.transaction(force_rollback=True):
                await self.store.save_thread(rolled_back, self.context)
                entered.set()
                await release.wait()

        async def writer():
            await entered.wait()
            attempted.set()
            await self.store.save_thread(committed, self.context)

        first = self.start(owner())
        await asyncio.wait_for(entered.wait(), 3)
        # Created inside the same request context, but it is a different Task.
        second = self.start(writer())
        try:
            await asyncio.wait_for(attempted.wait(), 3)
            await asyncio.sleep(0.05)
            blocked = not second.done()
        finally:
            release.set()
        await asyncio.wait_for(asyncio.gather(first, second), 5)
        self.assertTrue(blocked, "Foreign task entered another task's transaction")
        self.assertEqual((await self.store.load_thread(committed.id, self.context)).id, committed.id)
        for context, identifier in (
            (self.context, rolled_back.id),
            (Context(self.db, "2", "201", "", {}), committed.id),
            (Context(self.db, "1", "102", "", {}), committed.id),
        ):
            with self.assertRaises(NotFoundError):
                await self.store.load_thread(identifier, context)
        await self.assert_healthy()

    async def test_nested_savepoint_rollback_retains_outer_writes_and_timeout_is_local(self):
        await self.db.execute("CREATE TEMP TABLE transaction_fixture (value int)")
        async with self.db.transaction():
            await self.db.execute("INSERT INTO transaction_fixture VALUES (1)")
            async with self.db.transaction("fixture_savepoint", force_rollback=True):
                await self.db.execute("INSERT INTO transaction_fixture VALUES (2)")
            await self.db.execute("INSERT INTO transaction_fixture VALUES (3)")
        rows = await (await self.db.execute("SELECT value FROM transaction_fixture ORDER BY value")).fetchall()
        self.assertEqual([row["value"] for row in rows], [1, 3])
        cursor = await psycopg.AsyncConnection.execute(self.db, "SHOW statement_timeout")
        self.assertEqual((await cursor.fetchone())["statement_timeout"], "0")
        await self.assert_healthy()

    async def test_cancelled_waiter_does_not_release_owners_transaction(self):
        entered, release, attempted = asyncio.Event(), asyncio.Event(), asyncio.Event()
        async def owner():
            async with self.db.transaction():
                await self.db.execute("SELECT 1")
                entered.set()
                await release.wait()
                await self.db.execute("SELECT 2")
        async def waiter():
            attempted.set()
            await self.db.execute("SELECT 3")
        first = self.start(owner())
        await asyncio.wait_for(entered.wait(), 3)
        second = self.start(waiter())
        try:
            await attempted.wait()
            await asyncio.sleep(0.05)
            blocked = not second.done()
            second.cancel()
            result = await asyncio.gather(second, return_exceptions=True)
            third = self.start(self.db.execute("SELECT 4"))
            await asyncio.sleep(0.05)
            still_blocked = not third.done()
        finally:
            release.set()
        await asyncio.wait_for(asyncio.gather(first, third), 5)
        self.assertTrue(blocked and still_blocked)
        self.assertIsInstance(result[0], asyncio.CancelledError)
        await self.assert_healthy()

    async def test_cancelling_running_query_rolls_back_and_next_waiter_succeeds(self):
        pid = self.db.info.backend_pid
        query = self.start(self.db.execute("SELECT pg_sleep(5)"))
        async with asyncio.timeout(3):
            while True:
                row = await (await self.operator.execute(
                    "SELECT wait_event FROM pg_stat_activity WHERE pid=%s", (pid,)
                )).fetchone()
                if row and row["wait_event"] == "PgSleep":
                    break
                await asyncio.sleep(0.01)
        following = self.start(self.db.execute("SELECT 9 AS value"))
        query.cancel()
        result = await asyncio.wait_for(asyncio.gather(query, return_exceptions=True), 5)
        self.assertIsInstance(result[0], asyncio.CancelledError)
        cursor = await asyncio.wait_for(following, 3)
        self.assertEqual((await cursor.fetchone())["value"], 9)
        await self.assert_healthy()

    async def test_statement_timeout_rolls_back_without_retry_and_connection_recovers(self):
        with patch("database.QUERY_TIMEOUT_MS", 50):
            with self.assertRaises(psycopg.errors.QueryCanceled):
                await self.db.execute("SELECT pg_sleep(1)")
        await self.assert_healthy()

    async def test_separate_connections_do_not_share_transaction_lock(self):
        async with self.db.transaction():
            await self.db.execute("SELECT 1")
            cursor = await asyncio.wait_for(self.operator.execute("SELECT 8 AS value"), 2)
            self.assertEqual((await cursor.fetchone())["value"], 8)
        await self.assert_healthy()


if __name__ == "__main__":
    unittest.main()
