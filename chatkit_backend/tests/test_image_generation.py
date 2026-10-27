"""Actual SDK/ChatKit protocol checks; only provider HTTP and persistence are faked."""
import base64
import asyncio
import json
import os
import sys
import unittest
from itertools import count
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import httpx2
from chatkit.types import Page
from openai import APIConnectionError, APIStatusError, APITimeoutError, AsyncOpenAI

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ai_provider import ProviderConfig
from assistant import PortalChatKitServer, make_agent
from generation import create_image_artifact
from provider_errors import ImageGenerationError, image_provider_error, provider_issue
from store import Context, PostgresStore

PRIVATE = "private provider text sk-test-secret and client instructions"
IMAGE_BYTES = b"RIFF\x10\x00\x00\x00WEBPtest-image-bytes"


def image_api_error(code, status=429, request_id="req_image_test"):
    request = httpx2.Request("POST", "https://api.openai.com/v1/images/generations")
    return APIStatusError(PRIVATE, response=httpx2.Response(status, request=request,
        headers={"x-request-id": request_id}), body={"code": code, "message": PRIVATE})


class ImageErrorTests(unittest.TestCase):
    def test_real_status_and_known_code_are_exposed_but_not_provider_text(self):
        for code, status, expected, retry in [
            ("insufficient_quota", 429, "insufficient_quota", False),
            ("billing_hard_limit_reached", 429, "insufficient_quota", False),
            (None, 429, "rate_limit_exceeded", True),
            ("invalid_api_key", 401, "authentication_failed", False),
            ("model_not_found", 404, "model_unavailable", False),
            ("moderation_blocked", 400, "moderation_blocked", False),
            (None, 400, "image_invalid_request", False),
            (None, 503, "image_server_error", True),
        ]:
            with self.subTest(code=code, status=status):
                error = image_provider_error(image_api_error(code, status))
                issue = provider_issue(error)
                self.assertEqual(issue.code, expected)
                self.assertEqual(issue.allow_retry, retry)
                self.assertIn(f"HTTP {status}", issue.message)
                self.assertIn("req_image_test", issue.message)
                self.assertNotIn(PRIVATE, issue.message + str(error))

    def test_unknown_codes_and_malicious_request_ids_are_not_forwarded(self):
        issue = provider_issue(image_provider_error(image_api_error(PRIVATE, 500, PRIVATE)))
        self.assertNotIn(PRIVATE, issue.message)
        self.assertEqual(issue.code, "image_server_error")
        self.assertNotIn("OpenAI request:", issue.message)

    def test_connection_errors_have_no_invented_http_status(self):
        request = httpx2.Request("POST", "https://api.openai.com/v1/images/generations")
        for error, expected in [(APITimeoutError(request=request), "image_generation_timeout"),
                                (APIConnectionError(request=request), "image_connection_failed")]:
            issue = provider_issue(image_provider_error(error))
            self.assertEqual(issue.code, expected)
            self.assertNotIn("HTTP", issue.message)

    def test_agents_wrapping_cannot_hide_a_safe_image_failure(self):
        error = image_provider_error(image_api_error("insufficient_quota"))
        wrapper = RuntimeError(PRIVATE)
        wrapper.__cause__ = error
        self.assertEqual(provider_issue(wrapper), error.issue)
        self.assertNotIn(PRIVATE, provider_issue(wrapper).message)


class ImageToolTests(unittest.IsolatedAsyncioTestCase):
    def context(self):
        return Context(AsyncMock(), "11", "22", "Global instructions", {"display_name": "Test"},
            config={"images": True, "instructions": "Approved brand", "imageLimit": 10},
            preview=True, portal_origin="https://portal.example", thread_id="thr_test")

    async def test_env_model_is_forwarded_and_only_server_bytes_are_saved(self):
        for model in ["gpt-image-2", "gpt-image-2.5-flare", "gpt-image-2.5-sunburst"]:
            with self.subTest(model=model):
                context, api, emit = self.context(), AsyncMock(), AsyncMock()
                api.with_options = MagicMock(return_value=api)
                api.images.generate.return_value = SimpleNamespace(data=[SimpleNamespace(
                    b64_json=base64.b64encode(IMAGE_BYTES).decode())])
                with patch("generation.openai_hosted_client", return_value=api), \
                        patch.dict(os.environ, {"OPENAI_IMAGE_MODEL": model}):
                    result = await create_image_artifact(context, "Cat", "Generate an image of a cat", emit)
                request = api.images.generate.await_args.kwargs
                self.assertEqual(request["model"], model)
                self.assertIn("Generate an image of a cat", request["prompt"])
                self.assertEqual(request["output_format"], "webp")
                self.assertEqual(result["status"], "created")
                self.assertEqual(context.db.execute.await_args.args[1][-1], IMAGE_BYTES)
                self.assertEqual(context.db.execute.await_args.args[1][1:5], ("11", "22", "thr_test", True))
                emit.assert_awaited_once()
                self.assertEqual(context.artifacts[0]["url"], result["download_url"])

    async def test_missing_or_invalid_image_never_creates_a_download(self):
        for data in [[], [SimpleNamespace(b64_json=None)], [SimpleNamespace(b64_json="not base64")],
                     [SimpleNamespace(b64_json="")]]:
            context, api, emit = self.context(), AsyncMock(), AsyncMock()
            api.with_options = MagicMock(return_value=api)
            api.images.generate.return_value = SimpleNamespace(data=data)
            with patch("generation.openai_hosted_client", return_value=api), \
                    self.assertRaises(ImageGenerationError) as caught:
                await create_image_artifact(context, "Cat", "A cat", emit)
            self.assertEqual(provider_issue(caught.exception).code, "image_response_invalid")
            context.db.execute.assert_not_awaited()
            emit.assert_not_awaited()
            self.assertEqual(context.artifacts, [])

    async def test_disabled_or_unconfigured_images_never_call_openai(self):
        for enabled, expected in [(False, "image_tool_disabled"), (True, "image_provider_unconfigured")]:
            context = self.context()
            context.config["images"] = enabled
            with patch("generation.openai_hosted_client", return_value=None), \
                    self.assertRaises(ImageGenerationError) as caught:
                await create_image_artifact(context, "Cat", "A cat")
            self.assertEqual(provider_issue(caught.exception).code, expected)
            self.assertEqual(context.tool_calls, 0)
            context.db.execute.assert_not_awaited()

    async def test_monthly_limit_and_reply_limit_fail_before_any_image_request(self):
        for monthly_limit in [True, False]:
            context, api = self.context(), AsyncMock()
            context.preview = False
            context.tool_calls = 0 if monthly_limit else 2
            context.db.execute.return_value.fetchone.return_value = None
            with patch("generation.openai_hosted_client", return_value=api), \
                    self.assertRaises(ImageGenerationError) as caught:
                await create_image_artifact(context, "Cat", "A cat")
            self.assertEqual(provider_issue(caught.exception).code,
                "image_generation_limit_reached" if monthly_limit else "image_reply_limit_reached")
            api.images.generate.assert_not_awaited()
            self.assertEqual(context.artifacts, [])

    async def test_cancelled_image_request_is_not_reported_as_success(self):
        context, api, emit = self.context(), AsyncMock(), AsyncMock()
        api.with_options = MagicMock(return_value=api)
        api.images.generate.side_effect = asyncio.CancelledError()
        with patch("generation.openai_hosted_client", return_value=api), \
                self.assertRaises(asyncio.CancelledError):
            await create_image_artifact(context, "Cat", "A cat", emit)
        context.db.execute.assert_not_awaited()
        emit.assert_not_awaited()
        self.assertEqual(context.artifacts, [])

    async def test_general_chat_keeps_tools_disabled(self):
        context = self.context()
        context.response_route = "general"
        self.assertEqual(make_agent(context).tools, [])


def response_stream(output, response_id):
    response = {"id": response_id, "object": "response", "created_at": 1,
        "model": "gpt-6-luna", "status": "completed", "output": output,
        "parallel_tool_calls": False, "tool_choice": "auto", "tools": [],
        "usage": {"input_tokens": 10, "output_tokens": 10, "total_tokens": 20,
                  "input_tokens_details": {"cached_tokens": 0}, "output_tokens_details": {"reasoning_tokens": 0}}}
    events = [{"type": "response.created", "response": {**response, "status": "in_progress", "output": []}}]
    for index, item in enumerate(output):
        events.extend([
            {"type": "response.output_item.added", "output_index": index, "item": item},
            {"type": "response.output_item.done", "output_index": index, "item": item},
        ])
    events.append({"type": "response.completed", "response": response})
    return "".join("data: " + json.dumps(event) + "\n\n" for event in events)


class ImageChatKitStreamTests(unittest.IsolatedAsyncioTestCase):
    async def run_image_prompt(self, failure=False):
        requests, stored = [], []
        model_calls = 0

        def handle(request):
            nonlocal model_calls
            requests.append(request)
            if request.url.path == "/v1/images/generations":
                if failure:
                    return httpx2.Response(429, headers={"x-request-id": "req_image_integration"},
                        json={"error": {"code": "insufficient_quota", "type": "insufficient_quota", "message": PRIVATE}})
                return httpx2.Response(200, json={"created": 1, "data": [
                    {"b64_json": base64.b64encode(IMAGE_BYTES).decode()}]})
            self.assertEqual(request.url.path, "/v1/responses")
            model_calls += 1
            if model_calls == 1:
                output = [{"type": "function_call", "id": "fc_cat", "call_id": "call_cat",
                    "name": "create_image", "status": "completed", "arguments": json.dumps(
                        {"title": "Cat", "prompt": "Generate an image of a cat"})}]
            else:
                output = [{"type": "message", "id": "msg_cat", "role": "assistant", "status": "completed",
                    "content": [{"type": "output_text", "text": "The image is ready to download.", "annotations": []}]}]
            return httpx2.Response(200, headers={"content-type": "text/event-stream"},
                content=response_stream(output, f"resp_{model_calls}"))

        store = MagicMock(spec=PostgresStore)
        store.generate_thread_id.return_value = "thr_test"
        ids = count()
        store.generate_item_id.side_effect = lambda kind, *args: f"{kind}_{next(ids)}"

        async def save_item(thread_id, item, context):
            stored[:] = [prior for prior in stored if prior.id != item.id]
            stored.append(item)

        async def load_items(*args, **kwargs):
            return Page(data=list(reversed(stored)))

        store.add_thread_item.side_effect = save_item
        store.save_item.side_effect = save_item
        store.load_thread_items.side_effect = load_items
        context = Context(AsyncMock(), "11", "22", "Be helpful.", {"display_name": "Test"},
            config={"images": True, "instructions": "Approved brand", "imageLimit": 10},
            preview=True, portal_origin="https://portal.example")
        context.ai_provider = ProviderConfig("openai", "OpenAI", "test-only", None, "gpt-6-luna", {}, "test-only")
        context.ai_model = "gpt-6-luna"
        # Simulate an existing hosted client with retries enabled. Image calls
        # must still use one attempt, even for a 429 billing response.
        async with AsyncOpenAI(api_key="test-only", max_retries=2,
                http_client=httpx2.AsyncClient(transport=httpx2.MockTransport(handle))) as client:
            context.hosted_client = client
            with patch("ai_provider.active_client", return_value=client), \
                    patch.dict(os.environ, {"OPENAI_IMAGE_MODEL": "gpt-image-2.5-flare"}), \
                    patch("assistant.logger"):
                stream = await PortalChatKitServer(store).process(json.dumps({
                    "type": "threads.create", "params": {"input": {
                        "content": [{"type": "input_text", "text": "Generate image of cat"}],
                        "attachments": [], "inference_options": {}}}}).encode(), context)
                async with asyncio.timeout(15):
                    wire = b"".join([chunk async for chunk in stream]).decode()
        events = [json.loads(part.removeprefix("data: ")) for part in wire.strip().split("\n\n")]
        body = json.loads(requests[0].content)
        self.assertEqual(body["model"], "gpt-6-luna")
        self.assertIn("create_image", [tool["name"] for tool in body["tools"]])
        image_requests = [request for request in requests if request.url.path == "/v1/images/generations"]
        self.assertEqual(len(image_requests), 1)
        self.assertEqual(json.loads(image_requests[0].content)["model"], "gpt-image-2.5-flare")
        self.assertNotIn(PRIVATE, wire)
        return events, context, model_calls, wire

    async def test_cat_request_calls_image_api_and_emits_a_server_download_widget(self):
        events, context, model_calls, wire = await self.run_image_prompt()
        self.assertFalse([event for event in events if event["type"] == "error"], wire)
        self.assertEqual(model_calls, 2)
        self.assertEqual(len(context.artifacts), 1)
        self.assertTrue(any(event.get("item", {}).get("type") == "widget" for event in events), wire)
        self.assertIn("download_file", wire)

    async def test_image_api_failure_reaches_chatkit_without_an_ai_rewrite_or_fake_download(self):
        events, context, model_calls, wire = await self.run_image_prompt(failure=True)
        errors = [event for event in events if event["type"] == "error"]
        self.assertEqual(len(errors), 1, wire)
        self.assertFalse(errors[0]["allow_retry"])
        self.assertIn("insufficient_quota", errors[0]["message"])
        self.assertIn("HTTP 429", errors[0]["message"])
        self.assertIn("req_image_integration", errors[0]["message"])
        self.assertEqual(model_calls, 1, "A failed image API call must not be reinterpreted by the AI")
        self.assertEqual(context.artifacts, [])
        self.assertNotIn("download_file", wire)
        self.assertNotIn("ready to download", wire)


if __name__ == "__main__":
    unittest.main()
