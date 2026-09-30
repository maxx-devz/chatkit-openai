import os
import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from psycopg.errors import UndefinedTable

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from site_ai_settings import load_site_model


class SiteModelTests(unittest.IsolatedAsyncioTestCase):
    async def test_saved_model_wins_and_changes_are_not_cached(self):
        db = AsyncMock()
        db.execute.return_value.fetchone.side_effect = [
            {"model": "vendor/one:free"}, {"model": "vendor/two:free"}, None,
        ]
        with patch.dict(os.environ, {"OPENROUTER_API_KEY": "sk-or-v1-test", "OPENROUTER_MODEL": "openrouter/free"}):
            self.assertEqual(await load_site_model(db), "vendor/one:free")
            self.assertEqual(await load_site_model(db), "vendor/two:free")
            self.assertEqual(await load_site_model(db), "openrouter/free")
        self.assertEqual(db.execute.await_args.args[1], ("openrouter",))

    async def test_missing_migration_falls_back_but_other_errors_do_not(self):
        db = AsyncMock()
        with patch.dict(os.environ, {"OPENROUTER_API_KEY": "", "OPENAI_MODEL": "test-openai"}):
            db.execute.side_effect = UndefinedTable()
            self.assertEqual(await load_site_model(db), "test-openai")
            db.execute.side_effect = RuntimeError("offline")
            with self.assertRaises(RuntimeError):
                await load_site_model(db)
