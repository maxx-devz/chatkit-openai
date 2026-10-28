"""Offline-only Decisions policy and real SDK wire tests. No paid API calls."""
import asyncio
import copy
import json
import os
import sys
import unittest
from pathlib import Path
from itertools import count as sequence
from unittest.mock import AsyncMock, MagicMock, patch

import httpx2
from agents.usage import Usage
from openai import AsyncOpenAI

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ai_provider import ProviderConfig
from decision_routing import (CHOICES, MODEL, accepted_choice, combined_usage,
                              decision_input, eligible, select_response_route)
from response_routing import route_response
from store import Context


def context(**changes):
    ctx = Context(None, "client-A", "user-A", "PRIVATE COMPANY RULES", {"display_name": "Client A"})
    ctx.ai_provider = ProviderConfig("openai", "OpenAI", "sk-test-never-live-1234567890", None, MODEL, {})
    ctx.ai_model = MODEL
    ctx.hubstaff = {"index": {"available": True}}
    for key, value in changes.items():
        setattr(ctx, key, value)
    return ctx


def response(choice="project", confidence=0.95):
    return {"model": MODEL, "answers": [{
        "type": "choice", "name": "capability", "choice": choice, "confidence": confidence,
        "probabilities": [{"value": value, "probability": 0.94 if value == choice else 0.01}
                          for value in CHOICES],
    }], "usage": {"input_tokens": 120, "output_tokens": 0, "total_tokens": 120,
                  "input_tokens_details": {"cached_tokens": 0, "cache_write_tokens": 0}}}


class DecisionPolicyTests(unittest.TestCase):
    def setUp(self):
        self.enterContext(patch.dict(os.environ, {"OPENAI_DECISIONS_ROUTING": "true"}))

    def test_clear_prompts_and_small_talk_skip_extra_request(self):
        for text in ["What task has most hours?", "Generate an image of a cat", "Read a document",
                     "Check the website", "Hi!", "Who are you?", "", "   "]:
            with self.subTest(text=text):
                self.assertFalse(eligible(context(), text))

    def test_ambiguous_activity_and_followups_can_use_decisions(self):
        for text in ["What has Vianca been up to?", "What about last winter?", "Can you explain that?",
                     "Any recent SEO activities?"]:
            self.assertTrue(eligible(context(), text), text)

    def test_modes_previews_identity_and_attachments_are_gates(self):
        for changes in [dict(chat_mode="general"), dict(preview=True), dict(client_id=""),
                        dict(user_id=None), dict(ai_model="other"), dict(ai_provider=None)]:
            self.assertFalse(eligible(context(**changes), "What about winter?"))
        self.assertFalse(eligible(context(), "Explain this", has_attachment=True))
        with patch.dict(os.environ, {"OPENAI_DECISIONS_ROUTING": "false"}):
            self.assertFalse(eligible(context(), "Explain this"))

    def test_no_cross_provider_or_custom_endpoint_key_use(self):
        for provider in [
            ProviderConfig("openrouter", "OpenRouter", "sk-or-v1-fake", None, MODEL, {}),
            ProviderConfig("openai", "OpenAI", "fake", "https://untrusted.invalid/v1", MODEL, {}),
            ProviderConfig("openai", "OpenAI", "fake", None, "other-model", {}),
            ProviderConfig("openai", "OpenAI", "", None, MODEL, {}),
        ]:
            self.assertFalse(eligible(context(ai_provider=provider), "Explain this"))

    def test_bounded_user_only_input_redacts_secrets_and_source_metadata(self):
        ctx = context()
        ctx.source_references = [{"name": "Private Source Title", "text": "PRIVATE SOURCE BODY"}]
        raw = decision_input(
            "Explain this " + ctx.ai_provider.api_key + "\nPassword: NeverExpose123!\n"
            "Private Source Title SRC-abc123 https://tasks.hubstaff.com/private-task\n" + "x" * 4000,
            ["drop-oldest", "y" * 1000, "z" * 1000], ctx)
        data = json.loads(raw)
        self.assertEqual(len(data["previous_user_messages"]), 2)
        self.assertLessEqual(len(data["current_user_message"]), 2000)
        self.assertTrue(all(len(text) <= 750 for text in data["previous_user_messages"]))
        for private in ["drop-oldest", "NeverExpose123!", ctx.ai_provider.api_key, "https://", "SRC-abc123",
                        "Private Source Title", "PRIVATE COMPANY RULES", "PRIVATE SOURCE BODY", "client-A", "user-A"]:
            self.assertNotIn(private, raw)

    def test_input_is_request_local_not_a_global_history_cache(self):
        first = decision_input("Explain this", ["First user's request"], context())
        second = decision_input("Explain this", ["Second user's request"], context(client_id="B", user_id="B"))
        self.assertNotIn("First user", second)
        self.assertNotEqual(first, second)

    def test_valid_choices_are_literal_values(self):
        for choice in CHOICES:
            self.assertEqual(accepted_choice(response(choice)), None if choice == "uncertain" else choice)

    def test_refusals_weak_and_malformed_answers_are_rejected(self):
        mutations = [
            lambda p: p.update(model="other-model"),
            lambda p: p.update(answers=[]),
            lambda p: p["answers"].append(copy.deepcopy(p["answers"][0])),
            lambda p: p["answers"][0].update(type="refusal"),
            lambda p: p["answers"][0].update(name="other"),
            lambda p: p["answers"][0].update(choice=True),
            lambda p: p["answers"][0].update(choice="other-client-id"),
            lambda p: p["answers"][0].update(confidence=True),
            lambda p: p["answers"][0].update(confidence=float("nan")),
            lambda p: p["answers"][0].update(confidence=0.84),
            lambda p: p["answers"][0].update(probabilities=[]),
            lambda p: p["answers"][0]["probabilities"][0].update(probability=float("inf")),
            lambda p: p["answers"][0]["probabilities"][0].update(probability=0.01),
            lambda p: p["answers"][0]["probabilities"][1].update(value="project"),
            lambda p: p["answers"][0]["probabilities"][1].update(value=True),
        ]
        for mutation in mutations:
            payload = response()
            mutation(payload)
            self.assertIsNone(accepted_choice(payload))
        for payload in [None, [], {}, {"model": MODEL, "answers": ["not-an-answer"]}]:
            self.assertIsNone(accepted_choice(payload))


class DecisionRequestTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.enterContext(patch.dict(os.environ, {"OPENAI_DECISIONS_ROUTING": "true"}))

    async def call(self, ctx, payload, query="What has Vianca been up to?"):
        client = AsyncMock()
        client.__aenter__.return_value = client
        client.post.return_value = payload
        with patch("decision_routing.active_client", return_value=client) as factory:
            route = await select_response_route(ctx, query)
        return route, client, factory

    async def test_uses_real_installed_sdk_with_mocked_http_transport(self):
        requests = []
        def handle(request):
            requests.append(request)
            return httpx2.Response(200, json=response())
        ctx = context()
        with patch("decision_routing.active_client", side_effect=lambda *a, **kw: AsyncOpenAI(
                api_key="sk-test-offline-only", base_url="https://api.openai.com/v1", **kw,
                http_client=httpx2.AsyncClient(transport=httpx2.MockTransport(handle)))):
            route = await select_response_route(ctx, "What has Vianca been up to?",
                                                previous_queries=["We are discussing SEO"])
        self.assertEqual(route, "hubstaff")
        self.assertEqual(len(requests), 1)
        self.assertEqual(str(requests[0].url), "https://api.openai.com/v1/decisions")
        body = json.loads(requests[0].content)
        self.assertEqual(set(body), {"model", "input", "questions"})
        self.assertEqual(body["model"], MODEL)
        self.assertEqual(body["questions"][0]["type"], "choice")
        self.assertEqual(body["questions"][0]["choices"][0]["value"], "project")
        self.assertNotIn("PRIVATE COMPANY RULES", str(body))
        self.assertEqual(ctx.cost_events[0]["usage"]["input_tokens"], 120)

    async def test_decisions_cannot_grant_scope_or_enable_tools(self):
        ctx = context()
        ctx.config = {"imageGeneration": False}
        before = copy.deepcopy((ctx.client_id, ctx.user_id, ctx.hubstaff, ctx.config))
        route, client, factory = await self.call(ctx, response("generation"))
        self.assertEqual(route, "work")
        self.assertEqual((ctx.client_id, ctx.user_id, ctx.hubstaff, ctx.config), before)
        self.assertEqual(factory.call_args.kwargs["max_retries"], 0)
        client.post.assert_awaited_once()
        # The same request cannot spend a second decision call.
        self.assertFalse(eligible(ctx, "What has Vianca been up to?"))

    async def test_project_route_without_snapshot_keeps_work_tools(self):
        route, _, _ = await self.call(context(hubstaff=None), response())
        self.assertEqual(route, "work")

    async def test_standalone_general_can_remove_tools_but_followups_cannot(self):
        route, _, _ = await self.call(context(), response("general"), query="Explain gravity")
        self.assertEqual(route, "general")
        route, _, _ = await self.call(context(), response("general"), query="Explain that")
        self.assertEqual(route, "work")

    async def test_all_failures_fall_back_without_retries_or_secret_logs(self):
        query = "What has Vianca been up to?"
        for status in [403, 404, 429, 500, 503]:
            requests = []
            def handle(request):
                requests.append(request)
                return httpx2.Response(status, json={"error": {"message": "PRIVATE-DO-NOT-LOG"}})
            ctx = context()
            with patch("decision_routing.active_client", side_effect=lambda *a, **kw: AsyncOpenAI(
                    api_key="sk-test-offline-only", **kw,
                    http_client=httpx2.AsyncClient(transport=httpx2.MockTransport(handle)))), \
                    self.assertLogs("decision_routing", level="INFO") as logs:
                route = await select_response_route(ctx, query)
            self.assertEqual(route, route_response(query, has_hubstaff=True))
            self.assertEqual(len(requests), 1)
            self.assertNotIn("PRIVATE-DO-NOT-LOG", str(logs.output))
            self.assertIsNone(ctx.cost_events[0]["usage"])

    async def test_low_confidence_refusal_and_bad_json_keep_local_router(self):
        for payload in [response(confidence=0.3), {"answers": [{"type": "refusal"}]}, None, "bad"]:
            route, _, _ = await self.call(context(), payload)
            self.assertEqual(route, "hubstaff")

    async def test_deadline_falls_back_and_closes_client(self):
        client = AsyncMock()
        client.__aenter__.return_value = client
        async def slow(*args, **kwargs):
            await asyncio.Event().wait()
        client.post.side_effect = slow
        with patch("decision_routing.active_client", return_value=client), \
                patch("decision_routing.DEADLINE_SECONDS", 0.01):
            route = await select_response_route(context(), "Explain that")
        self.assertEqual(route, "work")
        client.__aexit__.assert_awaited_once()

    async def test_cancellation_propagates_and_closes_client(self):
        ctx = context()
        client = AsyncMock()
        client.__aenter__.return_value = client
        client.post.side_effect = asyncio.CancelledError()
        with patch("decision_routing.active_client", return_value=client):
            with self.assertRaises(asyncio.CancelledError):
                await select_response_route(ctx, "Explain that")
        client.__aexit__.assert_awaited_once()
        self.assertIsNone(ctx.cost_events[0]["usage"])

    async def test_general_clear_intents_previews_and_other_providers_never_make_a_call(self):
        for ctx, query in [(context(chat_mode="general"), "Explain that"),
                           (context(preview=True), "Explain that"),
                           (context(ai_provider=None), "Explain that"),
                           (context(), "Which task took most hours?"), (context(), "Hello")]:
            with patch("decision_routing.active_client") as client:
                route = await select_response_route(ctx, query)
            client.assert_not_called()
            self.assertFalse(ctx.cost_events)
            if ctx.chat_mode == "general":
                self.assertEqual(route, "general")


class DecisionUsageTests(unittest.TestCase):
    def test_aggregation_does_not_mutate_raw_reply_or_count_cached_tokens_twice(self):
        ctx = context()
        ctx.cost_events = [{"api": "decisions", "usage": response()["usage"]}]
        raw = Usage(requests=1, input_tokens=1000, output_tokens=50, total_tokens=1050)
        combined = combined_usage(ctx, raw)
        self.assertEqual((combined.input_tokens, combined.output_tokens, combined.total_tokens), (1120, 50, 1170))
        self.assertEqual(raw.total_tokens, 1050)
        self.assertEqual(combined.requests, 2)

    def test_decision_only_usage_is_still_recordable_if_final_reply_failed(self):
        ctx = context()
        ctx.cost_events = [{"api": "decisions", "usage": response()["usage"]}]
        self.assertEqual(combined_usage(ctx, None).total_tokens, 120)

    def test_unknown_and_invalid_auxiliary_usage_is_not_fabricated(self):
        for raw in [None, {}, {"input_tokens": True, "output_tokens": 0, "total_tokens": 1},
                    {"input_tokens": 5, "output_tokens": 1, "total_tokens": 5}]:
            ctx = context()
            ctx.cost_events = [{"api": "decisions", "usage": raw}, {"kind": "image", "usage": response()["usage"]}]
            self.assertIsNone(combined_usage(ctx, None))


class DecisionChatKitIntegrationTests(unittest.IsolatedAsyncioTestCase):
    async def test_decision_then_real_answer_stream_keeps_ui_and_accounting_contract(self):
        from assistant import PortalChatKitServer
        from chatkit.types import Page
        from store import PostgresStore
        from test_image_generation import response_stream

        requests, stored = [], []
        def handle(request):
            requests.append(request)
            if request.url.path == "/v1/decisions":
                return httpx2.Response(200, json=response())
            self.assertEqual(request.url.path, "/v1/responses")
            output = [{"type": "message", "id": "msg_answer", "role": "assistant", "status": "completed",
                       "content": [{"type": "output_text", "text": "Here is the verified project answer.", "annotations": []}]}]
            return httpx2.Response(200, headers={"content-type": "text/event-stream"},
                                   content=response_stream(output, "resp_answer"))

        def client_factory(*args, **kwargs):
            return AsyncOpenAI(api_key="sk-test-offline-only", **kwargs,
                http_client=httpx2.AsyncClient(transport=httpx2.MockTransport(handle)))

        store = MagicMock(spec=PostgresStore)
        store.generate_thread_id.return_value = "thr_scoped"
        ids = sequence()
        store.generate_item_id.side_effect = lambda kind, *args: f"{kind}_{next(ids)}"
        async def save(thread_id, item, context):
            stored[:] = [prior for prior in stored if prior.id != item.id]
            stored.append(item)
        async def load(*args, **kwargs):
            return Page(data=list(reversed(stored)))
        store.add_thread_item.side_effect = save
        store.save_item.side_effect = save
        store.load_thread_items.side_effect = load
        ctx = context(db=AsyncMock())
        # This follow-up's deterministic fallback is 'work'; a valid decision
        # must actually change it to 'hubstaff', not merely survive an exception.
        with patch.dict(os.environ, {"OPENAI_DECISIONS_ROUTING": "true"}), \
                patch("decision_routing.active_client", side_effect=client_factory), \
                patch("ai_provider.active_client", side_effect=client_factory), \
                patch("assistant.record_usage", new_callable=AsyncMock) as monthly, \
                patch("assistant.record_ai_usage_event", new_callable=AsyncMock) as audit, \
                patch("assistant.record_run_costs", new_callable=AsyncMock) as costs:
            stream = await PortalChatKitServer(store).process(json.dumps({
                "type": "threads.create", "params": {"input": {
                    "content": [{"type": "input_text", "text": "What about last winter?"}],
                    "attachments": [], "inference_options": {}}},
            }).encode(), ctx)
            async with asyncio.timeout(10):
                wire = b"".join([chunk async for chunk in stream]).decode()
        events = [json.loads(chunk.removeprefix("data: ")) for chunk in wire.strip().split("\n\n")]
        self.assertFalse([event for event in events if event["type"] == "error"], wire)
        self.assertIn("Here is the verified project answer.", wire)
        self.assertNotIn('"capability"', wire)
        self.assertEqual(ctx.response_route, "hubstaff")
        self.assertEqual([req.url.path for req in requests], ["/v1/decisions", "/v1/responses"])
        answer = json.loads(requests[1].content)
        self.assertIn("Current verified, read-only Hubstaff snapshot", str(answer["input"]))
        self.assertIn("Company Knowledge, source metadata", answer["instructions"])
        self.assertEqual(audit.await_args.kwargs["usage"].total_tokens, 140)
        self.assertEqual(audit.await_args.kwargs["status"], "succeeded")
        self.assertEqual(monthly.await_args.args[3].total_tokens, 140)
        # Only raw final-generation usage enters the chat cost calculation;
        # the classifier is already an independent context.cost_events entry.
        self.assertEqual(costs.await_args.args[1].context_wrapper.usage.total_tokens, 20)
        self.assertEqual(len(ctx.cost_events), 1)


if __name__ == "__main__":
    unittest.main()
