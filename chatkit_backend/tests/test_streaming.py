import asyncio
import sys
import unittest
from pathlib import Path
from datetime import datetime, timezone
from itertools import count

from chatkit.types import (AssistantMessageItem, AssistantMessageContent,
    AssistantMessageContentPartTextDelta, ThreadItemAddedEvent,
    ThreadItemUpdatedEvent, ThreadItemDoneEvent, ThreadItemRemovedEvent)

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from streaming import RequestEventQueue, unique_message_events


def message(identifier="__fake_id__", text="Example reply"):
    return AssistantMessageItem(id=identifier, thread_id="thr_test",
        created_at=datetime.now(timezone.utc), content=[AssistantMessageContent(text=text)])


async def event_source(events):
    for event in events:
        yield event


class MessageIdentityTests(unittest.IsolatedAsyncioTestCase):
    async def collect(self, events):
        ids = count()
        return [event async for event in unique_message_events(event_source(events), lambda: f"message_{next(ids)}")]

    async def test_each_message_in_one_run_gets_its_own_consistent_id(self):
        original = message()
        events = [ThreadItemAddedEvent(item=original),
            ThreadItemUpdatedEvent(item_id="__fake_id__",
                update=AssistantMessageContentPartTextDelta(content_index=0, delta="Example reply")),
            ThreadItemDoneEvent(item=original)]
        result = await self.collect(events + events)
        self.assertEqual([getattr(e, "item", None).id if hasattr(e, "item") else e.item_id for e in result],
                         ["message_0"] * 3 + ["message_1"] * 3)
        self.assertEqual(original.id, "__fake_id__", "Do not mutate SDK objects")
        self.assertEqual(result[2].item.content, original.content)

    async def test_native_openai_ids_and_unrelated_events_are_unchanged(self):
        events = [ThreadItemAddedEvent(item=message("msg_real_openai_id")),
            ThreadItemUpdatedEvent(item_id="msg_real_openai_id",
                update=AssistantMessageContentPartTextDelta(content_index=0, delta="text")),
            ThreadItemDoneEvent(item=message("msg_real_openai_id")),
            ThreadItemRemovedEvent(item_id="widget_existing")]
        result = await self.collect(events)
        for original, actual in zip(events, result):
            self.assertIs(actual, original)

    async def test_guardrail_removal_targets_all_new_messages_not_legacy_history(self):
        events = [ThreadItemAddedEvent(item=message()), ThreadItemDoneEvent(item=message()),
                  ThreadItemAddedEvent(item=message()), ThreadItemDoneEvent(item=message()),
                  ThreadItemRemovedEvent(item_id="__fake_id__")]
        result = await self.collect(events)
        self.assertEqual([e.item_id for e in result if e.type == "thread.item.removed"], ["message_0", "message_1"])

    async def test_done_only_events_also_get_separate_ids(self):
        result = await self.collect([ThreadItemDoneEvent(item=message()), ThreadItemDoneEvent(item=message())])
        self.assertEqual([e.item.id for e in result], ["message_0", "message_1"])

    async def test_closing_wrapper_closes_upstream_generator(self):
        closed = []
        async def source():
            try:
                yield ThreadItemAddedEvent(item=message())
                yield ThreadItemDoneEvent(item=message())
            finally:
                closed.append(True)
        stream = unique_message_events(source(), lambda: "message_test")
        await anext(stream)
        await stream.aclose()
        self.assertEqual(closed, [True])


class StreamCleanupTests(unittest.IsolatedAsyncioTestCase):
    async def test_closes_only_its_own_waiters_and_preserves_events(self):
        first, second = RequestEventQueue(), RequestEventQueue()
        first.put_nowait("widget")
        self.assertEqual(await first.get(), "widget")
        reader = asyncio.create_task(first.get())
        other = asyncio.create_task(second.get())
        await asyncio.sleep(0)
        try:
            await first.close()
            self.assertTrue(reader.cancelled())
            self.assertFalse(other.done())
            self.assertEqual(first.readers, set())
            second.put_nowait("other client's widget")
            self.assertEqual(await other, "other client's widget")
        finally:
            await second.close()
