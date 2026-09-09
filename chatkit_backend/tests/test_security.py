import hashlib
import hmac
import json
import os
import sys
import time
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import AsyncMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import app, validate_payload
from chatkit.types import Page, ThreadMetadata
from security import verify_signature

SECRET = "test-only-shared-secret-with-at-least-32-characters"


class SignatureTests(unittest.TestCase):
    def test_signature_rejects_tampering_expiration_and_bad_encoding(self):
        body = '{"client_id":"1","text":"你好"}'.encode()
        signature = hmac.new(SECRET.encode(), b"1234." + body, hashlib.sha256).hexdigest()
        self.assertTrue(verify_signature(body, "1234", signature, SECRET, now=1234))
        self.assertFalse(verify_signature(body.replace(b'"1"', b'"2"'), "1234", signature, SECRET, now=1234))
        self.assertFalse(verify_signature(body, "1234", signature, SECRET, now=1300))
        self.assertFalse(verify_signature(body, "1234", signature, SECRET, now=1100))
        for timestamp, value in [("", signature), ("²", signature), ("9" * 100, signature), ("1234", "é" * 64)]:
            self.assertFalse(verify_signature(body, timestamp, value, SECRET, now=1234))
        self.assertFalse(verify_signature(body, "1234", signature, "short", now=1234))

    def test_reject_unsupported_operations_and_user_overrides(self):
        valid = {"type": "threads.create", "params": {"input": {
            "content": [{"type": "input_text", "text": "Help me"}],
            "attachments": [], "inference_options": {},
        }}}
        self.assertEqual(validate_payload(valid).type, "threads.create")
        for field, value in [("attachments", ["other-client-file"]), ("inference_options", {"model": "arbitrary-model"}),
                             ("content", [{"type": "input_text", "text": "x" * 12001}]),
                             ("content", [{"type": "input_text", "text": "   "}])]:
            payload = json.loads(json.dumps(valid))
            payload["params"]["input"][field] = value
            with self.assertRaises(ValueError):
                validate_payload(payload)
        for limit in [0, -1]:
            with self.assertRaises(ValueError):
                validate_payload({"type": "threads.list", "params": {"limit": limit}})
        with self.assertRaises(ValueError):
            validate_payload({"type": "input.transcribe", "params": {"audio_base64": "", "mime_type": "audio/wav"}})

    def test_browser_history_request_is_bounded_without_rejecting_it(self):
        # Captured from the official ChatKit browser runtime on initial load.
        payload = {"type": "threads.list", "params": {"limit": 9999, "order": "desc"}}
        parsed = validate_payload(payload)
        self.assertEqual(parsed.params.limit, 100)
        self.assertEqual(parsed.params.order, "desc")
        for operation in ["threads.list", "items.list"]:
            for requested, expected in [(None, None), (1, 1), (100, 100), (100000, 100)]:
                with self.subTest(operation=operation, limit=requested):
                    params = {"limit": requested, "after": "previous", "order": "asc"}
                    if operation == "items.list":
                        params["thread_id"] = "thr_test"
                    parsed = validate_payload({"type": operation, "params": params})
                    self.assertEqual(parsed.params.limit, expected)
                    self.assertEqual(parsed.params.after, "previous")
                    self.assertEqual(parsed.params.order, "asc")


async def post(body, headers=None, *, include_body=False):
    sent = []
    scope = {"type": "http", "asgi": {"version": "3.0", "spec_version": "2.4"},
             "http_version": "1.1", "method": "POST", "scheme": "http", "path": "/chatkit",
             "raw_path": b"/chatkit", "query_string": b"", "root_path": "",
             "headers": [(b"content-type", b"application/json"), *(headers or [])],
             "server": ("test", 80), "client": ("127.0.0.1", 1)}
    async def receive():
        return {"type": "http.request", "body": body, "more_body": False}
    async def send(message):
        sent.append(message)
    await app(scope, receive, send)
    status = next(message["status"] for message in sent if message["type"] == "http.response.start")
    if include_body:
        return status, json.loads(b"".join(message.get("body", b"") for message in sent
                                         if message["type"] == "http.response.body"))
    return status


class EndpointTests(unittest.IsolatedAsyncioTestCase):
    async def test_signed_browser_history_request_reaches_sdk_with_bounded_pagination(self):
        first = [ThreadMetadata(id=f"thr_{index}", created_at=datetime.now(timezone.utc))
                 for index in range(100)]
        last = ThreadMetadata(id="thr_last", created_at=datetime.now(timezone.utc))
        pages = [Page(data=first, has_more=True, after=first[-1].id), Page(data=[last])]
        db = AsyncMock()
        with patch.dict(os.environ, {"CHATKIT_BACKEND_SECRET": SECRET, "DATABASE_URL": "test-only"}), \
                patch("app.connect_database", new_callable=AsyncMock, return_value=db), \
                patch("app.load_client", new_callable=AsyncMock, return_value={}), \
                patch("app.load_config", new_callable=AsyncMock, return_value={}), \
                patch("app.store.load_threads", new_callable=AsyncMock, side_effect=pages) as load_threads, \
                patch("app.reserve_request", new_callable=AsyncMock) as reserve:
            for after in [None, first[-1].id]:
                body = json.dumps({"client_id": "1", "user_id": "2", "instructions": "Test",
                                   "portal_origin": "https://example.com", "payload": {
                                       "type": "threads.list", "params": {
                                           "limit": 9999, "order": "desc", "after": after,
                                       }}}).encode()
                timestamp = str(int(time.time())).encode()
                signature = hmac.new(SECRET.encode(), timestamp + b"." + body, hashlib.sha256).hexdigest().encode()
                status, response = await post(body, [(b"x-chatkit-timestamp", timestamp),
                                                     (b"x-chatkit-signature", signature)], include_body=True)
                self.assertEqual(status, 200)
                self.assertEqual(len(response["data"]), 100 if after is None else 1)
                self.assertEqual(response["has_more"], after is None)
                self.assertEqual(response.get("after"), first[-1].id if after is None else None)
                args = load_threads.await_args.kwargs
                self.assertEqual(args["limit"], 100)
                self.assertEqual(args["after"], after)
                self.assertEqual(args["context"].scope, ("1", "2"))
            reserve.assert_not_awaited()
            self.assertEqual(db.close.await_count, 2)

    async def test_unsigned_direct_backend_request_never_opens_database(self):
        with patch.dict(os.environ, {"CHATKIT_BACKEND_SECRET": SECRET}), patch("app.connect_database", new_callable=AsyncMock) as connect:
            self.assertEqual(await post(b'{"client_id":"1","user_id":"2"}'), 401)
            connect.assert_not_awaited()

    async def test_oversized_request_is_rejected_before_database(self):
        with patch.dict(os.environ, {"CHATKIT_BACKEND_SECRET": SECRET}), patch("app.connect_database", new_callable=AsyncMock) as connect:
            self.assertEqual(await post(b"x" * 150001), 413)
            connect.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
