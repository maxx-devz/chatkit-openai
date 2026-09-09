import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from usage_tracking import record_usage


class FakeDatabase:
    def __init__(self, fail=False):
        self.fail = fail
        self.params = None

    async def execute(self, query, params):
        self.params = params
        if self.fail:
            raise RuntimeError("database unavailable")


class UsageTests(unittest.IsolatedAsyncioTestCase):
    async def test_unreported_failure_and_aggregated_provider_usage(self):
        started = datetime.now(timezone.utc)
        db = FakeDatabase()
        await record_usage(db, "client", started, SimpleNamespace(requests=0))
        self.assertEqual(db.params[2:6], (0, 0, 0, 0))
        await record_usage(db, "preview", started, SimpleNamespace(requests=2,
            input_tokens=120, output_tokens=30, total_tokens=150))
        self.assertEqual(db.params[0], "preview")
        self.assertEqual(db.params[2:6], (1, 120, 30, 150))

    async def test_accounting_failure_does_not_break_a_reply(self):
        with self.assertLogs("usage_tracking", level="ERROR"):
            await record_usage(FakeDatabase(fail=True), "client", datetime.now(timezone.utc))


if __name__ == "__main__":
    unittest.main()
