import hashlib
import hmac
import json
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import app, validate_payload
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
        with self.assertRaises(ValueError):
            validate_payload({"type": "threads.list", "params": {"limit": 100000}})
        with self.assertRaises(ValueError):
            validate_payload({"type": "input.transcribe", "params": {"audio_base64": "", "mime_type": "audio/wav"}})


async def post(body, headers=None):
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
    return next(message["status"] for message in sent if message["type"] == "http.response.start")


class EndpointTests(unittest.IsolatedAsyncioTestCase):
    async def test_unsigned_direct_backend_request_never_opens_database(self):
        with patch.dict(os.environ, {"CHATKIT_BACKEND_SECRET": SECRET}), patch("app.psycopg.AsyncConnection.connect", new_callable=AsyncMock) as connect:
            self.assertEqual(await post(b'{"client_id":"1","user_id":"2"}'), 401)
            connect.assert_not_awaited()

    async def test_oversized_request_is_rejected_before_database(self):
        with patch.dict(os.environ, {"CHATKIT_BACKEND_SECRET": SECRET}), patch("app.psycopg.AsyncConnection.connect", new_callable=AsyncMock) as connect:
            self.assertEqual(await post(b"x" * 150001), 413)
            connect.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
