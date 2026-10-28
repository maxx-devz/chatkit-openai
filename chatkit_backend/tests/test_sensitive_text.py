import asyncio
from datetime import datetime, timezone
from pathlib import Path
import sys
import unittest
from unittest.mock import AsyncMock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sensitive_text import redact_sensitive_text, sanitize_assistant_item
from streaming import sanitized_message_events
from store import Context, PostgresStore
from source_privacy import redact_source_details
from chatkit.types import (AssistantMessageItem, AssistantMessageContent, ThreadItemAddedEvent,
                           ThreadItemDoneEvent, ThreadItemUpdatedEvent, AssistantMessageContentPartTextDelta)


def message(text):
    return AssistantMessageItem(id="msg_1", thread_id="thr_1", created_at=datetime.now(timezone.utc),
                                content=[AssistantMessageContent(text=text)])


class SensitiveTextTests(unittest.IsolatedAsyncioTestCase):
    def test_private_source_metadata_is_removed_but_client_task_links_survive(self):
        name = "Company Knowledge - Company Identity, Brand & Services"
        task = "https://tasks.hubstaff.com/app/organizations/14952/projects/346902/tasks/5426464"
        context = Context(AsyncMock(), "1", "2", "Test", {}, source_references=[{"name": name}])
        original = message(f"AOC builds ecommerce stores. [{name}, SRC-cvQM42FYbWGw]\n"
                           f"{name}\n[Private source](https://docs.google.com/document/d/private-id/edit)\n"
                           f"https://drive.google.com/drive/folders/private-folder\nTask: {task}\n"
                           "Public page: https://example.com/services")
        safe = sanitize_assistant_item(original, context).content[0].text
        for private in (name, "SRC-", "private-id", "private-folder", "google.com"):
            self.assertNotIn(private, safe)
        self.assertIn("AOC builds ecommerce stores.", safe)
        self.assertIn(task, safe)
        self.assertIn("https://example.com/services", safe)
        self.assertIn(name, original.content[0].text)
        self.assertIn("cannot share private source details", redact_source_details("[SRC-abcdefghijkl]"))

    async def test_citation_split_across_stream_chunks_and_old_history_is_hidden(self):
        citation = "Company Knowledge - Company Identity, Brand & Services, SRC-cvQM42FYbWGw"
        async def source():
            yield ThreadItemAddedEvent(item=message("AOC builds stores. [Company Knowledge"))
            yield ThreadItemUpdatedEvent(item_id="msg_1", update=AssistantMessageContentPartTextDelta(
                content_index=0, delta=" - Company Identity, Brand & Services, SRC-cvQM42FYbWGw]"))
            yield ThreadItemDoneEvent(item=message("AOC builds stores. [" + citation + "]"))
        events = [event async for event in sanitized_message_events(source())]
        self.assertNotIn("SRC-", str([event.model_dump() for event in events]))
        self.assertNotIn("Company Identity", str([event.model_dump() for event in events]))
        self.assertIn("AOC builds stores.", events[-1].item.content[0].text)
        db = AsyncMock()
        db.execute.return_value.fetchone.return_value = {"data": message("AOC builds stores. [" + citation + "]").model_dump(mode="json")}
        context = Context(db, "1", "2", "Test", {})
        old = await PostgresStore().load_item("thr_1", "msg_1", context)
        self.assertNotIn("SRC-", old.content[0].text)
        self.assertNotIn("Company Identity", old.content[0].text)

    def test_common_and_known_secrets_are_redacted_and_task_links_survive(self):
        link = "https://tasks.hubstaff.com/app/organizations/14952/projects/346902/tasks/5426464"
        secrets = ["PlainPass123!", "sk-proj-abcdefghijklmnop123456", "eyJabcdefghijk.abcdefghijkl.signature", "known-custom-secret"]
        text = f"Approved work.\nPassword is {secrets[0]}\nAPI token: {secrets[1]}\n{secrets[2]}\n{secrets[3]}\nclient_secret=\nPrivateValue123\nAuthorization: Bearer abcdefghijkl\nhttps://example.com/?api_key=hidden\nLink: {link}"
        safe = redact_sensitive_text(text, [secrets[3]])
        for secret in secrets + ["PrivateValue123", "api_key=hidden", "abcdefghijkl"]:
            self.assertNotIn(secret, safe)
        self.assertIn(link, safe)

    async def test_no_candidate_text_is_emitted_before_a_complete_message(self):
        async def source():
            yield ThreadItemAddedEvent(item=message("Password: Plain"))
            yield ThreadItemUpdatedEvent(item_id="msg_1", update=AssistantMessageContentPartTextDelta(content_index=0, delta="Pass123!"))
            yield ThreadItemDoneEvent(item=message("Password: PlainPass123!\nReady for review."))
        events = [event async for event in sanitized_message_events(source())]
        self.assertEqual([event.type for event in events], ["thread.item.added", "thread.item.updated", "thread.item.updated", "thread.item.done"])
        self.assertNotIn("PlainPass", str([event.model_dump() for event in events]))
        self.assertIn("Ready for review", events[-1].item.content[0].text)

    async def test_cancelled_or_failed_candidate_never_leaks(self):
        async def source():
            yield ThreadItemAddedEvent(item=message("Password: PlainPass123!"))
            raise asyncio.CancelledError()
        emitted = []
        with self.assertRaises(asyncio.CancelledError):
            async for event in sanitized_message_events(source()):
                emitted.append(event)
        self.assertEqual(emitted, [])

    async def test_store_redacts_writes_and_existing_history_reads(self):
        db = AsyncMock()
        cursor = AsyncMock()
        cursor.fetchone.return_value = {"id": "msg_1"}
        db.execute.return_value = cursor
        context = Context(db, "1", "2", "Test", {})
        store = PostgresStore()
        original = message("Password: PlainPass123!\nReview is complete.")
        await store.save_item("thr_1", original, context)
        self.assertNotIn("PlainPass", str(db.execute.call_args.args[1][4].obj))
        self.assertIn("PlainPass", original.content[0].text, "Do not mutate SDK/history objects")
        cursor.fetchone.return_value = {"data": original.model_dump(mode="json")}
        result = await store.load_item("thr_1", "msg_1", context)
        self.assertNotIn("PlainPass", result.content[0].text)

    def test_secret_split_over_content_parts_is_not_forwarded(self):
        original = message("Password:")
        original.content.append(AssistantMessageContent(text="PlainPass123!"))
        self.assertNotIn("PlainPass", str(sanitize_assistant_item(original)))
