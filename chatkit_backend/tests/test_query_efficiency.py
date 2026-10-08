"""Keep common ChatKit database operations scoped without redundant reads."""
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

from psycopg.errors import UndefinedTable

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from builder_config import load_config
from chatkit.store import NotFoundError
from store import PostgresStore


class QueryEfficiencyTests(unittest.IsolatedAsyncioTestCase):
    async def test_config_load_is_one_query_and_preserves_client_overrides(self):
        cursor = AsyncMock()
        cursor.fetchone.return_value = {"published": {"documents": True, "instructions": "old"}}
        db = AsyncMock()
        db.execute.return_value = cursor
        config = await load_config(db, {"id": 7, "assistant_instructions": "Approved"})
        self.assertEqual(db.execute.await_count, 1)
        self.assertTrue(config["documents"])
        self.assertEqual(config["instructions"], "Approved")

    async def test_config_load_still_works_before_builder_migration(self):
        db = AsyncMock()
        db.execute.side_effect = UndefinedTable()
        config = await load_config(db, {"id": 7, "assistant_instructions": "Approved"})
        self.assertEqual(config["instructions"], "Approved")

    async def test_save_item_uses_one_scoped_query_and_rejects_missing_thread(self):
        cursor = AsyncMock()
        cursor.fetchone.return_value = {"id": "msg_1"}
        db = AsyncMock()
        db.execute.return_value = cursor
        context = SimpleNamespace(scope=("1", "2"), db=db)
        item = SimpleNamespace(thread_id="thr_test", id="msg_1",
                               model_dump=lambda **_kwargs: {"id": "msg_1"})
        await PostgresStore().save_item("thr_test", item, context)
        self.assertEqual(db.execute.await_count, 1)
        query, params = db.execute.await_args.args
        self.assertIn("WHERE client_id=%s AND user_id=%s AND id=%s", query)
        self.assertEqual(params[-3:], ("1", "2", "thr_test"))

        cursor.fetchone.return_value = None
        with self.assertRaises(NotFoundError):
            await PostgresStore().save_item("thr_test", item, context)
        self.assertEqual(db.execute.await_count, 2)


if __name__ == "__main__":
    unittest.main()
