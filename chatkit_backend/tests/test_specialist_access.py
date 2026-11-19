import unittest
from unittest.mock import AsyncMock
from fastapi import HTTPException
from specialist_access import specialist_evidence, recheck_specialist_work


class SpecialistAccessTests(unittest.IsolatedAsyncioTestCase):
    async def test_only_narrow_function_is_called(self):
        db = AsyncMock()
        cursor = AsyncMock()
        cursor.fetchone.return_value = {"evidence": {"deliverables": "Approved delivery"}}
        db.execute.return_value = cursor
        self.assertEqual((await specialist_evidence(db, "actor", "session", "assignment"))["deliverables"], "Approved delivery")
        sql, params = db.execute.call_args.args
        self.assertIn("specialist_evidence", sql)
        self.assertNotIn("portal_internal", sql)
        self.assertEqual(params, ("actor", "session", "assignment"))

    async def test_denial_is_sanitized(self):
        db = AsyncMock()
        db.execute.side_effect = RuntimeError("HR_PRIVATE_CANARY and database details")
        with self.assertRaises(HTTPException) as denied:
            await specialist_evidence(db, "actor", "session", "assignment")
        self.assertEqual(denied.exception.status_code, 403)
        self.assertNotIn("HR_PRIVATE", denied.exception.detail)

    async def test_unknown_action_does_not_query_database(self):
        db = AsyncMock()
        with self.assertRaises(HTTPException):
            await recheck_specialist_work(db, "actor", "session", "assignment", "client.ai.use")
        db.execute.assert_not_called()
