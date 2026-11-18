"""Real source approval/tool checks, enabled only by the disposable fixture."""
import asyncio
import json
import hashlib
import hmac
import time
import os
import selectors
import sys
import unittest
from pathlib import Path
from urllib.parse import urlparse
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app import Envelope, load_client
from assistant import guard_tools
from agents import function_tool
from agents.tool_context import ToolContext
from database import connect_database
from store import Context
from fastapi import HTTPException
from unittest.mock import AsyncMock, patch
from httpx2 import ASGITransport, AsyncClient
from chatkit.server import StreamingResult
from app import app

@unittest.skipUnless(os.getenv("STAGE08_BOUNDARY"),"Requires disposable source fixture")
class SourceTools(unittest.IsolatedAsyncioTestCase):
    if sys.platform=="win32":
        loop_factory=staticmethod(lambda:asyncio.SelectorEventLoop(selectors.SelectSelector()))

    async def test_revoked_source_stops_tools_before_and_after_execution(self):
        runtime=urlparse(os.environ["DATABASE_URL"])
        owner=urlparse(os.environ["AGENCY_WORKSPACE_TEST_DATABASE_URL"])
        self.assertEqual(runtime.hostname,"127.0.0.1")
        self.assertRegex(runtime.path,r"^/aoc_stage04_rehearsal_[a-f0-9]+$")
        self.assertEqual((owner.hostname,owner.port,owner.path),(runtime.hostname,runtime.port,runtime.path))
        db=await connect_database(os.environ["DATABASE_URL"])
        bootstrap=await connect_database(os.environ["AGENCY_WORKSPACE_TEST_DATABASE_URL"])
        try:
            fixture=json.loads(os.environ["STAGE08_BOUNDARY"])
            envelope=Envelope(**fixture)
            client=await load_client(db,envelope)
            context=Context(db,envelope.client_id,envelope.user_id,"",client)
            context.authorization=envelope
            invoked=[]
            @function_tool
            async def scoped_read() -> str:
                """Return synthetic evidence for this workspace."""
                invoked.append(True)
                return "AOC_AMBER"
            tool=guard_tools([scoped_read],context)[0]
            run=ToolContext(context=context,tool_name=tool.name,tool_call_id="fixture-call",tool_arguments="{}")
            self.assertIn("AOC_AMBER",await tool.on_invoke_tool(run,"{}"))
            await bootstrap.execute("UPDATE portal_source_publications SET enabled=false WHERE owner_id=300 AND audience='clients'")
            with self.assertRaises(HTTPException):
                await tool.on_invoke_tool(run,"{}")
            self.assertEqual(len(invoked),1)
            await bootstrap.execute("UPDATE portal_source_publications SET enabled=true WHERE owner_id=300 AND audience='clients'")
            @function_tool
            async def revoked_during_read() -> str:
                """Simulate access withdrawal during a provider round trip."""
                await bootstrap.execute("UPDATE portal_prepared_source_indexes SET failure_code='access_denied' WHERE owner_id=300")
                return "SHOULD_NOT_BE_DELIVERED"
            with self.assertRaises(HTTPException):
                await guard_tools([revoked_during_read],context)[0].on_invoke_tool(run,"{}")
            await bootstrap.execute("UPDATE portal_prepared_source_indexes SET failure_code=NULL WHERE owner_id=300")
            # Model-supplied foreign scope cannot replace the signed session owner.
            bad=dict(fixture,client_id="801")
            with self.assertRaises(HTTPException):
                await load_client(db,Envelope(**bad))
        finally:
            await db.close()
            await bootstrap.close()

    async def test_stream_withholds_chunks_after_source_access_is_revoked(self):
        target=urlparse(os.environ["DATABASE_URL"])
        owner=urlparse(os.environ["AGENCY_WORKSPACE_TEST_DATABASE_URL"])
        self.assertEqual(target.hostname,"127.0.0.1")
        self.assertRegex(target.path,r"^/aoc_stage04_rehearsal_[a-f0-9]+$")
        self.assertEqual((target.hostname,target.port,target.path),(owner.hostname,owner.port,owner.path))
        fixture=json.loads(os.environ["STAGE08_BOUNDARY"])
        fixture["payload"]={"type":"threads.list","params":{}}
        bootstrap=await connect_database(os.environ["AGENCY_WORKSPACE_TEST_DATABASE_URL"])
        async def chunks():
            yield b'data: {"fixture":"PERMITTED_CHUNK"}\n\n'
            await bootstrap.execute("UPDATE portal_source_publications SET enabled=false WHERE owner_id=300 AND audience='clients'")
            yield b'data: {"fixture":"REVOKED_CHUNK"}\n\n'
        secret="synthetic-stream-secret-at-least-32-characters"
        raw=json.dumps(fixture).encode()
        stamp=str(int(time.time()))
        signature=hmac.new(secret.encode(),stamp.encode()+b"."+raw,hashlib.sha256).hexdigest()
        try:
            with patch.dict(os.environ,{"CHATKIT_BACKEND_SECRET":secret}), patch("app.server.process",new=AsyncMock(return_value=StreamingResult(chunks()))):
                async with AsyncClient(transport=ASGITransport(app=app),base_url="http://fixture.test") as http:
                    response=await http.post("/chatkit",content=raw,headers={"x-chatkit-timestamp":stamp,"x-chatkit-signature":signature})
            self.assertEqual(response.status_code,200)
            self.assertIn("PERMITTED_CHUNK",response.text)
            self.assertNotIn("REVOKED_CHUNK",response.text)
        finally:
            await bootstrap.execute("UPDATE portal_source_publications SET enabled=true WHERE owner_id=300 AND audience='clients'")
            await bootstrap.close()
