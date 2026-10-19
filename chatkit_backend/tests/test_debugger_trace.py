import asyncio
import base64
import contextvars
import hashlib
import hmac
import json
import os
from pathlib import Path
import sys
import time
import unittest
from unittest.mock import patch

import httpx2

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from debugger_trace import TraceSender, inline_debug_events, publish, verified_debug_context


class DebuggerTraceTests(unittest.IsolatedAsyncioTestCase):
    async def test_real_task_cancellation_is_preserved_after_response_close(self):
        class Chunks(httpx2.AsyncByteStream):
            async def __aiter__(self):
                yield b"first event"
                raise asyncio.CancelledError()
        async def handler(request):
            return httpx2.Response(200, stream=Chunks())
        events = []
        async with httpx2.AsyncClient(transport=httpx2.MockTransport(handler)) as client:
            sender = TraceSender(client, {"parentId": "backend:1"})
            with patch("debugger_trace.publish", side_effect=lambda trace, record: events.append(record)):
                response = await sender.send(client.build_request("GET", "https://api.example.test/reply"), stream=True)
                with self.assertRaises(asyncio.CancelledError):
                    await response.aread()
                await response.aclose()
        self.assertEqual(events[-1]["state"], "cancelled")

    async def test_consumer_close_is_not_misreported_as_user_cancellation_or_full_eof(self):
        class Chunks(httpx2.AsyncByteStream):
            async def __aiter__(self):
                yield b"first event"
                yield b"unread event"
        async def handler(request):
            return httpx2.Response(200, stream=Chunks())
        events = []
        async with httpx2.AsyncClient(transport=httpx2.MockTransport(handler)) as client:
            sender = TraceSender(client, {"parentId": "backend:1"})
            with patch("debugger_trace.publish", side_effect=lambda trace, record: events.append(record)):
                response = await sender.send(client.build_request("GET", "https://api.example.test/reply"), stream=True)
                await response.aclose()
        self.assertEqual(events[-1]["state"], "closed")
        self.assertIn("EOF", events[-1]["observation"])
        self.assertNotIn("first event", json.dumps(events))

    def test_context_requires_signed_unexpired_inline_scope_in_local_and_production(self):
        secret = "test-service-secret-" * 3
        data = {"s": "session-1", "transport": "inline", "parentId": "request:1", "tabId": "tab:1", "navigationId": "nav:1", "e": time.time() * 1000 + 60_000}
        payload = base64.urlsafe_b64encode(json.dumps(data).encode()).decode().rstrip("=")
        signature = hmac.new(secret.encode(), f"debug:{payload}".encode(), hashlib.sha256).hexdigest()
        headers = {"x-aoc-debug-context": payload + "." + signature}
        with patch.dict(os.environ, {"DEBUGGER": "true", "CHATKIT_BACKEND_SECRET": secret, "BETTER_AUTH_URL": "http://127.0.0.1:3000"}):
            self.assertEqual(verified_debug_context(headers)["s"], "session-1")
            self.assertIsNone(verified_debug_context({"x-aoc-debug-context": payload + ".bad"}))
            with patch.dict(os.environ, {"DEBUGGER": "false"}):
                self.assertIsNone(verified_debug_context(headers))
            with patch.dict(os.environ, {"BETTER_AUTH_URL": "https://production.test"}):
                self.assertEqual(verified_debug_context(headers)["s"], "session-1")
            with patch.dict(os.environ, {"BETTER_AUTH_URL": "http://insecure-production.test"}):
                self.assertIsNone(verified_debug_context(headers))

    async def test_request_queues_are_private_bounded_and_never_exported_to_a_server(self):
        a = {"_queue": asyncio.Queue(maxsize=120), "_records": {}, "tabId": "a", "navigationId": "nav-a"}
        b = {"_queue": asyncio.Queue(maxsize=120), "_records": {}, "tabId": "b", "navigationId": "nav-b"}
        with patch.dict(os.environ, {"DEBUGGER": "true"}):
            for i in range(150):
                publish(a, {"id": str(i), "state": "pending"})
            publish(b, {"id": "b-only", "state": "pending"})
        self.assertEqual(a["_queue"].qsize(), 120)
        self.assertEqual(len(a["_records"]), 120)
        self.assertEqual(b["_queue"].get_nowait()["id"], "b-only")
        self.assertNotIn("b-only", a["_records"])

    async def test_inline_stream_delivers_progress_before_slow_ai_without_changing_frames(self):
        trace = {"_queue": asyncio.Queue(maxsize=120), "_records": {}, "tabId": "a", "navigationId": "nav-a"}
        proceed = asyncio.Event()
        async def source():
            with patch.dict(os.environ, {"DEBUGGER": "true"}):
                publish(trace, {"id": "provider:1", "state": "pending"})
            await proceed.wait()
            yield b'data: {"actual":"reply"}\n\n'
        iterator = inline_debug_events(source(), trace)
        first = await asyncio.wait_for(anext(iterator), timeout=1)
        self.assertTrue(first.startswith(b": aoc-debug "))
        proceed.set()
        rest = [chunk async for chunk in iterator]
        self.assertEqual(b"".join(rest), b'data: {"actual":"reply"}\n\n')
        self.assertNotIn("_queue", trace)

    async def test_cancellation_only_cancels_owned_tasks(self):
        trace = {"_queue": asyncio.Queue(maxsize=120), "_records": {}, "tabId": "a", "navigationId": "nav-a"}
        unrelated = asyncio.create_task(asyncio.sleep(5))
        async def source():
            await asyncio.sleep(5)
            yield b"data: later\n\n"
        iterator = inline_debug_events(source(), trace)
        request = asyncio.create_task(anext(iterator))
        await asyncio.sleep(0)
        request.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await request
        self.assertFalse(unrelated.cancelled())
        unrelated.cancel()
        await asyncio.gather(unrelated, return_exceptions=True)
        self.assertNotIn("_queue", trace)

    async def test_disabled_trace_preserves_bytes_and_partial_frames_are_not_corrupted(self):
        async def source():
            yield b"data: split"
            yield b" frame\n\n"
        self.assertEqual(b"".join([chunk async for chunk in inline_debug_events(source(), None)]), b"data: split frame\n\n")

    async def test_sdk_context_tokens_keep_one_task_and_context_across_all_frames(self):
        local = contextvars.ContextVar("sdk_test")
        owners = []
        trace = {"_queue": asyncio.Queue(maxsize=120), "_records": {}, "tabId": "a", "navigationId": "nav-a"}
        async def source():
            token = local.set("active")
            try:
                for i in range(3):
                    owners.append(asyncio.current_task())
                    yield f"data: {i}\n\n".encode()
                    self.assertEqual(local.get(), "active")
            finally:
                local.reset(token)
        result = [chunk async for chunk in inline_debug_events(source(), trace)]
        self.assertEqual(len(result), 3)
        self.assertEqual(len(set(owners)), 1)
        self.assertIsNone(local.get(None))

    async def test_stream_is_receiving_until_consumed_and_never_copies_body_or_credentials(self):
        class Chunks(httpx2.AsyncByteStream):
            async def __aiter__(self):
                yield b"private AI response"
        async def handler(request):
            return httpx2.Response(200, stream=Chunks(), headers={"content-type": "text/event-stream", "set-cookie": "hidden"})
        events = []
        async with httpx2.AsyncClient(transport=httpx2.MockTransport(handler)) as client:
            sender = TraceSender(client, {"parentId": "backend:1"})
            with patch("debugger_trace.publish", side_effect=lambda trace, record: events.append(record)):
                response = await sender.send(client.build_request("POST", "https://api.example.test/reply?token=hidden", headers={"authorization": "Bearer hidden"}), stream=True)
                self.assertEqual(events[-1]["state"], "receiving")
                self.assertEqual(await response.aread(), b"private AI response")
                self.assertEqual(events[-1]["state"], "complete")
                await response.aclose()
        exported = json.dumps(events)
        self.assertNotIn("private AI response", exported)
        self.assertNotIn("hidden", exported)

    async def test_transport_failure_is_recorded_and_original_error_propagates(self):
        async def handler(request):
            raise httpx2.ConnectError("test connection failed", request=request)
        events = []
        async with httpx2.AsyncClient(transport=httpx2.MockTransport(handler)) as client:
            sender = TraceSender(client, {"parentId": "backend:1"})
            with patch("debugger_trace.publish", side_effect=lambda trace, record: events.append(record)):
                with self.assertRaises(httpx2.ConnectError):
                    await sender.send(client.build_request("GET", "https://api.example.test/"))
        self.assertEqual(events[-1]["state"], "failed")


if __name__ == "__main__":
    unittest.main()
