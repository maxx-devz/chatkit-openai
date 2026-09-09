import json
import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import httpx2
from agents import Agent
from agents.models.openai_responses import OpenAIResponsesModel
from chatkit.types import Page
from openai import APIError, APIStatusError, AsyncOpenAI

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from assistant import PortalChatKitServer
from provider_errors import provider_issue
from store import Context, PostgresStore

PRIVATE_MESSAGE = "Do not expose this provider message: test-secret-key / private client prompt"


def api_error(code=None, status=None):
    request = httpx2.Request("POST", "https://api.openai.com/v1/responses")
    body = {"code": code, "message": PRIVATE_MESSAGE}
    if status is None:
        return APIError(PRIVATE_MESSAGE, request, body=body)
    return APIStatusError(PRIVATE_MESSAGE, response=httpx2.Response(status, request=request), body=body)


class ProviderIssueTests(unittest.TestCase):
    def test_stream_errors_are_classified_without_an_http_error_status(self):
        for code, expected in [
            ("credit_balance_exhausted", "credit_balance_exhausted"),
            ("insufficient_quota", "insufficient_quota"),
            ("billing_hard_limit_reached", "insufficient_quota"),
            ("billing_not_active", "insufficient_quota"),
            ("invalid_api_key", "authentication_failed"),
            ("model_not_found", "model_unavailable"),
        ]:
            with self.subTest(code=code):
                issue = provider_issue(api_error(code))
                self.assertEqual(issue.code, expected)
                self.assertFalse(issue.allow_retry)
                self.assertNotIn(PRIVATE_MESSAGE, issue.message)

    def test_http_429_does_not_always_mean_credits_are_exhausted(self):
        issue = provider_issue(api_error("credit_balance_exhausted", 429))
        self.assertEqual(issue.code, "credit_balance_exhausted")
        for code, status in [("rate_limit_exceeded", None), (None, 429)]:
            issue = provider_issue(api_error(code, status))
            self.assertEqual(issue.code, "rate_limit_exceeded")
            self.assertTrue(issue.allow_retry)
            self.assertNotIn("credits", issue.message)

    def test_unrecognized_provider_or_internal_details_are_not_exposed(self):
        for error in [api_error(PRIVATE_MESSAGE), api_error({"unexpected": PRIVATE_MESSAGE}),
                      api_error(None, 500), RuntimeError(PRIVATE_MESSAGE)]:
            issue = provider_issue(error)
            self.assertEqual(issue.code, "request_failed")
            self.assertNotIn(PRIVATE_MESSAGE, issue.message)
            self.assertTrue(issue.allow_retry)


class ChatKitProviderStreamTests(unittest.IsolatedAsyncioTestCase):
    async def test_actual_sdk_stream_errors_become_safe_chatkit_cards(self):
        # Exercise OpenAI's SSE decoder, the Agents runner and ChatKit's wire
        # protocol together. Only HTTP and persistence are faked; no paid calls.
        for status, code, can_retry in [(200, "credit_balance_exhausted", False),
                                        (429, "credit_balance_exhausted", False),
                                        (200, "rate_limit_exceeded", True)]:
            with self.subTest(status=status, code=code):
                requests = []

                def handle(request):
                    requests.append(request)
                    body = {"error": {"code": code, "message": PRIVATE_MESSAGE, "type": "test_error"}}
                    if status == 200:
                        return httpx2.Response(200, headers={"content-type": "text/event-stream"},
                                               content=f"data: {json.dumps(body)}\n\n")
                    return httpx2.Response(status, json=body)

                store = MagicMock(spec=PostgresStore)
                store.generate_thread_id.return_value = "thr_test"
                store.generate_item_id.return_value = "msg_test"
                stored_items = []

                async def save_item(thread_id, item, context):
                    stored_items.append(item)

                async def load_items(*args, **kwargs):
                    return Page(data=list(reversed(stored_items)))

                store.add_thread_item.side_effect = save_item
                store.load_thread_items.side_effect = load_items
                db = AsyncMock()
                context = Context(db, "1", "2", "Test instructions", {"display_name": "Test client"})
                server = PortalChatKitServer(store)
                async with AsyncOpenAI(api_key="test-only", max_retries=0,
                        http_client=httpx2.AsyncClient(transport=httpx2.MockTransport(handle))) as client:
                    agent = Agent(name="Test", model=OpenAIResponsesModel(
                        model="test-model", openai_client=client), instructions="Test")
                    with patch("assistant.make_agent", return_value=agent), \
                            self.assertLogs("assistant", level="ERROR") as logs:
                        stream = await server.process(json.dumps({"type": "threads.create", "params": {
                            "input": {"content": [{"type": "input_text", "text": "Hello"}],
                                      "attachments": [], "inference_options": {}}}}).encode(), context)
                        wire = b"".join([chunk async for chunk in stream]).decode()

                events = [json.loads(part.removeprefix("data: ")) for part in wire.strip().split("\n\n")]
                errors = [event for event in events if event["type"] == "error"]
                self.assertEqual(len(errors), 1)
                self.assertEqual(errors[0]["code"], "custom")
                self.assertEqual(errors[0]["allow_retry"], can_retry)
                self.assertEqual(errors[0]["message"], provider_issue(api_error(code)).message)
                self.assertIn(f"code={code}", "\n".join(logs.output))
                self.assertNotIn(PRIVATE_MESSAGE, wire + "\n".join(logs.output))
                self.assertEqual(len(requests), 1)
                self.assertTrue(json.loads(requests[0].content)["stream"])
                # A failed generation still records the attempt; missing token
                # usage must not be mistaken for confirmation of zero cost.
                db.execute.assert_awaited_once()
                self.assertIn("portal_ai_activity_monthly", db.execute.await_args.args[0])
                self.assertEqual(db.execute.await_args.args[1][2:6], (0, 0, 0, 0))


if __name__ == "__main__":
    unittest.main()
