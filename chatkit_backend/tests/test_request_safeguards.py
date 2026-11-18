import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from fastapi import HTTPException
from app import load_client, acquire_lease, Envelope, GENERATE

class RequestSafeguardTests(unittest.IsolatedAsyncioTestCase):
    async def test_access_remains_client_and_member_scoped_after_legacy_limit(self):
        client={"id":1,"monthly_prompt_limit":1,"requests_used":9999}
        cursor=SimpleNamespace(fetchone=AsyncMock(return_value=client))
        db=SimpleNamespace(execute=AsyncMock(return_value=cursor))
        envelope=Envelope(client_id="1",user_id="2",instructions="",payload={})
        for _ in range(3):
            self.assertEqual(await load_client(db,envelope),client)
        query,params=db.execute.call_args.args
        self.assertEqual(params,("1","2"))
        self.assertIn("client.portal_enabled=TRUE",query)
        self.assertIn("client.ai_enabled=TRUE",query)
        self.assertEqual(GENERATE,{"threads.create","threads.add_user_message","threads.retry_after_item"})

    async def test_unavailable_membership_or_disabled_access_still_denies(self):
        cursor=SimpleNamespace(fetchone=AsyncMock(return_value=None))
        db=SimpleNamespace(execute=AsyncMock(return_value=cursor))
        with self.assertRaises(HTTPException) as caught:
            await load_client(db,Envelope(client_id="1",user_id="2",instructions="",payload={}))
        self.assertEqual(caught.exception.status_code,403)

    async def test_request_lease_still_prevents_overlapping_generation(self):
        cursor=SimpleNamespace(fetchone=AsyncMock(return_value=None))
        context=SimpleNamespace(scope=("1","2"),db=SimpleNamespace(execute=AsyncMock(return_value=cursor)))
        with self.assertRaises(HTTPException) as caught: await acquire_lease(context,"fixture-token")
        self.assertEqual(caught.exception.status_code,409)
        self.assertEqual(context.db.execute.call_args.args[1],("1","2","fixture-token"))
