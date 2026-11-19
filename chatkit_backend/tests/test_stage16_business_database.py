"""Real runtime-role evidence authorization; no model/provider calls."""
import asyncio, json, os, selectors, sys, unittest
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import urlparse
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from business_context import load_business_evidence, inline_business_evidence
from app import Envelope
from database import connect_database, PortalConnection
from psycopg.rows import dict_row
from fastapi import HTTPException

@unittest.skipUnless(os.getenv("STAGE16_BUSINESS_BOUNDARY"),"Requires disposable business fixture")
class BusinessDatabase(unittest.IsolatedAsyncioTestCase):
    if sys.platform=="win32":
        loop_factory=staticmethod(lambda:asyncio.SelectorEventLoop(selectors.SelectSelector()))
    async def test_runtime_evidence_and_reauthorization(self):
        u=urlparse(os.environ["DATABASE_URL"])
        self.assertEqual(u.hostname,"127.0.0.1")
        self.assertRegex(u.path,r"^/aoc_stage04_rehearsal_[a-f0-9]+$")
        f=json.loads(os.environ["STAGE16_BUSINESS_BOUNDARY"])
        db=await connect_database(os.environ["DATABASE_URL"])
        admin=await PortalConnection.connect(os.environ["AGENCY_WORKSPACE_TEST_DATABASE_URL"],autocommit=True,row_factory=dict_row,prepare_threshold=None)
        a=f["accounts"]["businessA"]
        base={"agency_id":f["agency"]["id"],"client_id":f["clients"][0]["id"],"user_id":a["id"],"auth_session_id":a["session"],"instructions":"","payload":{}}
        try:
            evidence=await load_business_evidence(db,Envelope(**base))
            self.assertIn("A16_ORCHID_COFFEE",json.dumps(evidence))
            self.assertIn("A16_WEBSITE_TITLE",json.dumps(evidence))
            self.assertNotIn("B16_SECRET",json.dumps(evidence))
            messages=[{"role":"user","content":[{"type":"input_text","text":"Help plan my website"}]}]
            self.assertTrue(inline_business_evidence(messages,SimpleNamespace(chat_mode="work",business_evidence=evidence)))
            self.assertIn("A16_WEBSITE_TITLE",messages[0]["content"][0]["text"])
            with self.assertRaises(HTTPException):
                await load_business_evidence(db,Envelope(**{**base,"client_id":f["clients"][1]["id"]}))
            await admin.execute("UPDATE portal_memberships SET is_active=false WHERE client_id=%s AND user_id=%s",(base["client_id"],a["id"]))
            with self.assertRaises(HTTPException):
                await load_business_evidence(db,Envelope(**base))
        finally:
            await admin.execute("UPDATE portal_memberships SET is_active=true WHERE client_id=%s AND user_id=%s",(base["client_id"],a["id"]))
            await db.close();await admin.close()
