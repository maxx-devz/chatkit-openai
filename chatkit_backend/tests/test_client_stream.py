"""Exercise the real client agent and ChatKit bridge with a fake provider."""
import json
import os
import sys
import unittest
from itertools import count
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import httpx2
from openai import AsyncOpenAI
from chatkit.types import Page, AssistantMessageItem, AssistantMessageContent
from datetime import datetime, timezone

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ai_provider import configure_agents
from assistant import PortalChatKitServer
from provider_errors import provider_issue
from store import Context, PostgresStore


class ClientStreamTests(unittest.IsolatedAsyncioTestCase):
    async def test_openrouter_client_reply_reaches_chatkit(self):
        await self.check_client_reply("openrouter/free")

    async def test_vendor_model_id_is_preserved(self):
        await self.check_client_reply("vendor/model:free")

    async def test_openai_namespace_is_not_stripped_on_openrouter(self):
        await self.check_client_reply("openai/example-model")

    async def test_saved_site_model_overrides_environment_in_actual_request(self):
        await self.check_client_reply("openrouter/free", site_model="vendor/selected:free")

    async def test_follow_up_replays_saved_assistant_reply(self):
        await self.check_client_reply("vendor/model:free", follow_up=True)

    async def test_follow_ups_preserve_existing_legacy_reply(self):
        await self.check_client_reply("vendor/model:free", follow_up=True, legacy=True)

    async def test_independent_question_sends_no_tool_schemas(self):
        await self.check_client_reply("vendor/model:free", general=True)

    async def test_general_mode_work_question_still_sends_no_work_tools(self):
        await self.check_client_reply("vendor/model:free", general=True,
                                      prompt="Which Hubstaff tasks need a reply today?")

    async def test_clear_task_question_reuses_prefetched_snapshot_in_one_model_call(self):
        await self.check_client_reply("vendor/model:free", prompt="What tasks are in progress?")

    async def test_credential_output_is_redacted_before_wire_and_persistence(self):
        await self.check_client_reply("vendor/model:free", reply_text="Hello from AOC.\nPassword: PlainPass123!\nReady for review.")

    async def test_index_tool_round_trip_reaches_the_actual_chatkit_stream(self):
        await self.check_client_reply("vendor/model:free", prompt="Latest SEO activities?", indexed=True)

    async def check_client_reply(self, model, site_model=None, follow_up=False, legacy=False,
                                 general=False, prompt="Who are you?", reply_text=None, indexed=False):
        requests = []
        wires = []

        def handle(request):
            requests.append(request)
            chunks = [
                {"index": 0, "delta": {"role": "assistant", "content": (reply_text or f"Hello from AOC. Reply {len(requests)}.")[:25]}, "finish_reason": None},
                {"index": 0, "delta": {"content": (reply_text or f"Hello from AOC. Reply {len(requests)}.")[25:]}, "finish_reason": None},
                {"index": 0, "delta": {}, "finish_reason": "stop"},
            ]
            if indexed and len(requests) == 1:
                chunks = [
                    {"index":0,"delta":{"role":"assistant","tool_calls":[{"index":0,"id":"call_search","type":"function",
                      "function":{"name":"search_project_tasks","arguments":json.dumps({"query":"SEO OR optimization","order":"recent_activity"})}}]},"finish_reason":None},
                    {"index":0,"delta":{},"finish_reason":"tool_calls"},
                ]
            wire = "".join("data: " + json.dumps({
                "id": "chatcmpl-test", "object": "chat.completion.chunk", "created": 1,
                "model": "test/free", "choices": [choice],
            }) + "\n\n" for choice in chunks) + "data: [DONE]\n\n"
            return httpx2.Response(200, headers={"content-type": "text/event-stream"}, content=wire)

        store = MagicMock(spec=PostgresStore)
        store.generate_thread_id.return_value = "thr_test"
        ids = count()
        store.generate_item_id.side_effect = lambda kind, *args: f"{kind}_{next(ids)}"
        items = []
        if legacy:
            items.append(AssistantMessageItem(id="__fake_id__", thread_id="thr_test",
                created_at=datetime.now(timezone.utc), content=[AssistantMessageContent(text="Existing reply, preserve me.")]))
        threads = {}

        async def save_item(thread_id, item, context):
            items[:] = [saved for saved in items if saved.id != item.id]
            # Match the JSON round-trip through the real database.
            items.append(type(item).model_validate_json(item.model_dump_json()))

        async def save_thread(thread, context):
            threads[thread.id] = type(thread).model_validate_json(thread.model_dump_json())

        async def load_thread(thread_id, context):
            return threads[thread_id]

        async def load_items(*args, **kwargs):
            return Page(data=list(reversed(items)))

        store.add_thread_item.side_effect = save_item
        store.save_item.side_effect = save_item
        store.save_thread.side_effect = save_thread
        store.load_thread.side_effect = load_thread
        store.load_thread_items.side_effect = load_items
        context = Context(AsyncMock(), "1", "2", "Be helpful.", {"display_name": "Test client"})
        context.chat_mode = "general" if general else "work"
        context.hubstaff = None if general else {"workflow": {"columns": []}}
        if indexed:
            context.hubstaff = {"index":{"available":True,"metadataComplete":True}}
            context.hubstaff_index_binding = "a"*64
            cursor=AsyncMock()
            cursor.fetchone.side_effect=[
                {"metadata_complete":True,"project_url":"https://tasks.hubstaff.com/app/organizations/1/projects/7","metadata_completed_at":None,"checked_at":None},
                {"authorized":True,"tasks":[{"id":"5","title":"Verified SEO update"}],"total":1,"pending":0,"unresolved_people":0},
            ]
            context.db.execute.return_value=cursor
        context.ai_model = site_model
        with patch.dict(os.environ, {"OPENAI_API_KEY": "", "OPENROUTER_API_KEY": "sk-or-v1-test",
                                     "OPENROUTER_MODEL": model}), \
                patch("agents.models._openai_shared._default_openai_client", None), \
                patch("agents.models._openai_shared._use_responses_by_default", True):
            async with AsyncOpenAI(api_key="test-only", max_retries=0,
                    base_url="https://openrouter.ai/api/v1",
                    http_client=httpx2.AsyncClient(transport=httpx2.MockTransport(handle))) as client:
                with patch("ai_provider.active_client", return_value=client), \
                        patch("assistant.provider_issue", wraps=provider_issue) as failure:
                    configure_agents()
                    server = PortalChatKitServer(store)
                    stream = await server.process(json.dumps({
                        "type": "threads.create", "params": {"input": {
                            "content": [{"type": "input_text", "text": prompt}],
                            "attachments": [], "inference_options": {}}},
                    }).encode(), context)
                    wire = b"".join([chunk async for chunk in stream]).decode()
                    wires.append(wire)
                    if failure.called:
                        self.fail(str(failure.call_args.args[0]))
                    for _ in range(2 if follow_up else 0):
                        stream = await server.process(json.dumps({
                            "type": "threads.add_user_message", "params": {
                                "thread_id": "thr_test", "input": {
                                    "content": [{"type": "input_text", "text": "What did you just say?"}],
                                    "attachments": [], "inference_options": {}}},
                        }).encode(), context)
                        wire = b"".join([chunk async for chunk in stream]).decode()
                        wires.append(wire)
                        if failure.called:
                            self.fail(str(failure.call_args.args[0]))
        events = [json.loads(part.removeprefix("data: ")) for part in wire.strip().split("\n\n")]
        self.assertFalse([event for event in events if event["type"] == "error"], wire)
        self.assertIn("Hello from AOC.", wire)
        self.assertTrue(any(event["type"] == "thread.item.done" and
                            event["item"]["type"] == "assistant_message" for event in events))
        self.assertEqual(len(requests), 2 if indexed else 3 if follow_up else 1)
        self.assertEqual(requests[0].url.path, "/api/v1/chat/completions")
        body = json.loads(requests[0].content)
        self.assertEqual(body["model"], site_model or model)
        self.assertTrue(body["stream"])
        if indexed:
            self.assertIn("search_project_tasks",str(body.get("tools")))
            self.assertIn("Verified SEO update",str(json.loads(requests[-1].content)["messages"]))
        else:
            self.assertFalse(body.get("tools"))
        if not general:
            self.assertIn("Current verified, read-only Hubstaff snapshot", str(body["messages"]))
        if follow_up:
            history = json.loads(requests[-1].content)["messages"]
            self.assertTrue(any(message["role"] == "assistant" and "Hello from AOC." in str(message["content"])
                                for message in history))
            self.assertEqual(history[-1]["content"], [{"type": "text", "text": "What did you just say?"}])

        saved_replies = [item for item in items if item.type == "assistant_message"]
        self.assertEqual(len(saved_replies), len(requests) - int(indexed) + int(legacy), "Replies must not overwrite earlier history")
        if legacy:
            self.assertEqual(saved_replies[0].content[0].text, "Existing reply, preserve me.")
            saved_replies = saved_replies[1:]
        from sensitive_text import redact_sensitive_text
        self.assertEqual([item.content[0].text for item in saved_replies],
                         [redact_sensitive_text(reply_text or f"Hello from AOC. Reply {index + 1}.") for index in range(int(indexed),len(requests))])
        if reply_text:
            self.assertNotIn("PlainPass123!", "".join(wires))
            self.assertNotIn("PlainPass123!", str([item.model_dump() for item in saved_replies]))
        self.assertEqual(len({item.id for item in saved_replies}), len(requests)-int(indexed))
        self.assertNotIn("__fake_id__", [item.id for item in saved_replies])
        for wire, saved in zip(wires, saved_replies):
            turn_events = [json.loads(part.removeprefix("data: ")) for part in wire.strip().split("\n\n")]
            message_ids = [event["item"]["id"] for event in turn_events
                           if event["type"] in ("thread.item.added", "thread.item.done")
                           and event["item"]["type"] == "assistant_message"]
            delta_ids = [event["item_id"] for event in turn_events if event["type"] == "thread.item.updated"
                         and event["update"]["type"].startswith("assistant_message")]
            self.assertTrue(message_ids)
            self.assertTrue(delta_ids)
            self.assertEqual(set(message_ids + delta_ids), {saved.id}, "All stream events must address the saved message")


if __name__ == "__main__":
    unittest.main()
