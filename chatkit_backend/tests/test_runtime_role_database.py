"""Uses only the approved disposable fixture; never discovers private URLs."""
import asyncio
import os
import selectors
import sys
import unittest
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from database import connect_database, RuntimeDatabaseRoleError, RUNTIME_ROLE_SQL


@unittest.skipUnless(os.getenv("STAGE11_EXPECT_RUNTIME_SAFE"), "Requires disposable runtime-role fixture")
class RuntimeRoles(unittest.IsolatedAsyncioTestCase):
    if sys.platform == "win32":
        loop_factory = staticmethod(lambda: asyncio.SelectorEventLoop(selectors.SelectSelector()))

    async def test_actual_python_runtime_connector(self):
        target = urlparse(os.environ["DATABASE_URL"])
        self.assertEqual(target.hostname, "127.0.0.1")
        self.assertRegex(target.path, r"^/aoc_stage04_rehearsal_[a-f0-9]+$")
        if os.environ["STAGE11_EXPECT_RUNTIME_SAFE"] == "no":
            with self.assertRaises(RuntimeDatabaseRoleError):
                await connect_database(os.environ["DATABASE_URL"])
        else:
            async with await connect_database(os.environ["DATABASE_URL"]) as connection:
                facts = await (await connection.execute(RUNTIME_ROLE_SQL)).fetchone()
                self.assertTrue(facts["adopted"])
                self.assertTrue(facts["allowed"])
