"""Opt-in real database checks. Credentials arrive only from the synthetic test shell."""
import hashlib
import asyncio
import selectors
import hmac
import json
import os
import sys
import time
import unittest
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from httpx2 import ASGITransport, AsyncClient
from app import app, Envelope, load_client
from database import connect_database
from fastapi import HTTPException


@unittest.skipUnless(os.getenv("STAGE06_ACTORS"), "Requires disposable Stage 06 accounts")
class DatabaseBoundaries(unittest.IsolatedAsyncioTestCase):
    if sys.platform == "win32":
        loop_factory = staticmethod(lambda: asyncio.SelectorEventLoop(selectors.SelectSelector()))

    async def asyncSetUp(self):
        url = urlparse(os.environ["DATABASE_URL"])
        self.assertEqual(url.hostname, "127.0.0.1")
        self.assertRegex(url.path, r"^/aoc_stage04_rehearsal_[a-f0-9]+$")
        self.actors = json.loads(os.environ["STAGE06_ACTORS"])
        self.db = await connect_database(os.environ["DATABASE_URL"])
        bootstrap = urlparse(os.environ["AGENCY_WORKSPACE_TEST_DATABASE_URL"])
        self.assertEqual((bootstrap.hostname,bootstrap.port,bootstrap.path),(url.hostname,url.port,url.path))
        self.bootstrap = await connect_database(os.environ["AGENCY_WORKSPACE_TEST_DATABASE_URL"])
        self.http = AsyncClient(transport=ASGITransport(app=app), base_url="http://synthetic.test")

    async def asyncTearDown(self):
        await self.http.aclose()
        await self.db.close()
        await self.bootstrap.close()

    def envelope(self, actor, payload):
        return dict(client_id=actor["client"], user_id=actor["user"],
                    agency_id=actor["agency"], auth_session_id=actor["session"],
                    instructions="", payload=payload)

    async def send(self, envelope, path="/chatkit", secret=None):
        body = json.dumps(envelope).encode()
        stamp = str(int(time.time()))
        key = secret or os.environ["CHATKIT_BACKEND_SECRET"]
        signature = hmac.new(key.encode(), stamp.encode()+b"."+body, hashlib.sha256).hexdigest()
        return await self.http.post(path, content=body, headers={
            "content-type": "application/json", "x-chatkit-timestamp": stamp,
            "x-chatkit-signature": signature})

    async def test_four_clients_and_both_agencies(self):
        for actor in self.actors:
            for target in self.actors:
                data = self.envelope(actor, {})
                data.update(client_id=target["client"], agency_id=target["agency"])
                if actor is target and self.actors.index(actor) < 2:
                    client = await load_client(self.db, Envelope(**data))
                    self.assertEqual(str(client["id"]), actor["client"])
                else:
                    with self.assertRaises(HTTPException) as caught:
                        await load_client(self.db, Envelope(**data))
                    self.assertEqual(caught.exception.status_code, 403)

    async def test_signed_history_cursors_and_deletes_have_no_foreign_effect(self):
        actor = self.actors[0]
        for target in self.actors[1:]:
            cursor = await self.db.execute("SELECT id FROM portal_chatkit_threads WHERE client_id=%s AND data->>'title'=%s",
                                           (target["client"], "private-client-"+target["client"]))
            thread = (await cursor.fetchone())["id"]
            for operation in ("threads.get_by_id", "threads.delete", "items.list"):
                response = await self.send(self.envelope(actor, {"type": operation, "params": {"thread_id": thread}}))
                self.assertEqual(response.status_code, 404, response.text)
                self.assertNotIn("private-client", response.text)
            response = await self.send(self.envelope(actor, {"type": "threads.list", "params": {"after": thread, "limit": 1000}}))
            self.assertEqual(response.status_code, 404, response.text)
            cursor = await self.db.execute("SELECT count(*) AS n FROM portal_chatkit_threads WHERE client_id=%s AND id=%s",
                                           (target["client"], thread))
            self.assertEqual((await cursor.fetchone())["n"], 1)
        cursor = await self.db.execute("SELECT count(*) AS n FROM portal_chatkit_leases WHERE client_id=%s AND user_id=%s",
                                       (actor["client"],actor["user"]))
        self.assertEqual((await cursor.fetchone())["n"], 0)
        response = await self.send(self.envelope(actor, {"type":"threads.list","params":{}}), secret="x"*32)
        self.assertEqual(response.status_code,401)
        forged = self.envelope(actor, {"type":"threads.list","params":{}})
        forged["role"] = "aoc_admin"
        self.assertEqual((await self.send(forged)).status_code,400)

    async def test_suspension_role_revocation_session_and_internal_exclusion(self):
        actor = self.actors[0]
        data = self.envelope(actor, {})
        for column, value, restored in (("is_active", False, True), ("role", "client_viewer", "client_admin")):
            # The columns are a constant test-owned list, never user input.
            await self.db.execute(f"UPDATE portal_memberships SET {column}=%s WHERE client_id=%s AND user_id=%s",
                                  (value,actor["client"],actor["user"]))
            try:
                with self.assertRaises(HTTPException):
                    await load_client(self.db,Envelope(**data))
            finally:
                await self.db.execute(f"UPDATE portal_memberships SET {column}=%s WHERE client_id=%s AND user_id=%s",
                                      (restored,actor["client"],actor["user"]))
        bad = dict(data, auth_session_id="revoked-synthetic-session")
        with self.assertRaises(HTTPException):
            await load_client(self.db,Envelope(**bad))
        await self.bootstrap.execute("INSERT INTO portal_internal_users(user_id,hubstaff_user_id,is_active) VALUES(%s,990006,false)",
                              (actor["user"],))
        try:
            with self.assertRaises(HTTPException):
                await load_client(self.db,Envelope(**data))
        finally:
            await self.bootstrap.execute("DELETE FROM portal_internal_users WHERE user_id=%s",(actor["user"],))

    async def test_stage07_private_uploads_expire_and_keep_user_ownership(self):
        from store import Context
        from uploads import upload_file, load_upload
        from chatkit.store import NotFoundError
        actor = self.actors[0]
        client = await load_client(self.db, Envelope(**self.envelope(actor, {})))
        context = Context(self.db, actor["client"], actor["user"], "", client)
        first = await upload_file(context, "same.txt", b"private synthetic bytes")
        second = await upload_file(context, "same.txt", b"private synthetic bytes")
        self.assertNotEqual(first.id, second.id)
        self.assertEqual((await load_upload(context, first.id, include_content=True))["content"], b"private synthetic bytes")
        for target in self.actors[1:]:
            foreign = Context(self.db, target["client"], target["user"], "", {"id": target["client"]})
            with self.assertRaises(NotFoundError):
                await load_upload(foreign, first.id)
        other_user = Context(self.db, actor["client"], self.actors[1]["user"], "", client)
        with self.assertRaises(NotFoundError):
            await load_upload(other_user, first.id)
        await self.bootstrap.execute("UPDATE portal_chatkit_uploads SET created_at=now()-interval '25 hours' WHERE id=%s", (first.id,))
        with self.assertRaises(NotFoundError):
            await load_upload(context, first.id)
        data = self.envelope(actor, {"filename": "../escape.txt", "content": "dGVzdA=="})
        self.assertEqual((await self.send(data, "/chatkit/upload")).status_code, 400)
        data["payload"]["filename"] = "valid.txt"
        await self.bootstrap.execute("UPDATE portal_memberships SET is_active=false WHERE client_id=%s AND user_id=%s", (actor["client"],actor["user"]))
        try:
            self.assertEqual((await self.send(data, "/chatkit/upload")).status_code, 403)
        finally:
            await self.bootstrap.execute("UPDATE portal_memberships SET is_active=true WHERE client_id=%s AND user_id=%s", (actor["client"],actor["user"]))
