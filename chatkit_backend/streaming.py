"""Request-scoped cleanup for the pinned ChatKit 1.6.5 event bridge."""
import asyncio

from chatkit.agents import AgentContext, stream_agent_response
from pydantic import PrivateAttr
from chatkit.types import (ThreadItemAddedEvent, ThreadItemUpdatedEvent, AssistantMessageContent,
                           AssistantMessageContentPartAdded, AssistantMessageContentPartTextDelta)
from sensitive_text import sanitize_assistant_item


async def unique_message_events(events, generate_id):
    """Replace the Chat Completions adapter's shared placeholder at our boundary.

    ChatKit reuses Responses item IDs. The Agents SDK's Chat Completions bridge
    emits __fake_id__ for every assistant message, including later tool turns.
    Generate a fresh portal ID per message, not just per request, and keep it
    stable across all its updates. Leave native OpenAI IDs and tool IDs alone.
    """
    current_id = None
    completed = False
    introduced_ids = []
    try:
        async for event in events:
            item = getattr(event, "item", None)
            if (item is not None and item.type == "assistant_message"
                    and item.id == "__fake_id__"):
                if (event.type == "thread.item.added" or current_id is None
                        or (event.type == "thread.item.done" and completed)):
                    current_id = generate_id()
                    introduced_ids.append(current_id)
                    completed = False
                event = event.model_copy(update={"item": item.model_copy(update={"id": current_id})})
                if event.type == "thread.item.done":
                    completed = True
            elif getattr(event, "item_id", None) == "__fake_id__" and current_id:
                if event.type == "thread.item.removed":
                    # Guardrail cleanup can refer to the original placeholder
                    # once for several messages. Remove only this run's items,
                    # never the old legacy placeholder stored in its history.
                    for identifier in introduced_ids:
                        yield event.model_copy(update={"item_id": identifier})
                    current_id, completed, introduced_ids = None, False, []
                    continue
                if (event.type == "thread.item.updated"
                        and event.update.type.startswith("assistant_message.")):
                    event = event.model_copy(update={"item_id": current_id})
            yield event
    finally:
        close = getattr(events, "aclose", None)
        if close is not None:
            await close()


async def sanitized_message_events(events, request_context=None):
    """Withhold candidate text until the complete message can be checked.

    Redacting only deltas can leak a password/token split across network chunks.
    Cancellation/errors discard unfinished candidate text. Widgets keep working.
    """
    try:
        async for event in events:
            item = getattr(event, "item", None)
            update = getattr(event, "update", None)
            if item is not None and item.type == "assistant_message":
                if event.type != "thread.item.done":
                    continue
                safe = sanitize_assistant_item(item, request_context)
                yield ThreadItemAddedEvent(item=safe.model_copy(update={"content": []}))
                yield ThreadItemUpdatedEvent(item_id=safe.id, update=AssistantMessageContentPartAdded(
                    content_index=0, content=AssistantMessageContent(text="")))
                yield ThreadItemUpdatedEvent(item_id=safe.id, update=AssistantMessageContentPartTextDelta(
                    content_index=0, delta=safe.content[0].text))
                yield event.model_copy(update={"item": safe})
                continue
            if update is not None and update.type.startswith("assistant_message."):
                continue
            if item is not None and item.type == "workflow" and item.workflow.type == "reasoning":
                # Reasoning can quote raw candidates and arrive split across deltas.
                event = event.model_copy(update={"item": item.model_copy(update={
                    "workflow": item.workflow.model_copy(update={"tasks": []})})})
            elif update is not None and getattr(update, "task", None) is not None and update.task.type == "thought":
                event = event.model_copy(update={"update": update.model_copy(update={
                    "task": update.task.model_copy(update={"content": "Reviewing the request"})})})
            yield event
    finally:
        close = getattr(events, "aclose", None)
        if close is not None:
            await close()


def stream_portal_response(context, result):
    events = unique_message_events(stream_agent_response(context, result), lambda: context.generate_id("message"))
    return sanitized_message_events(events, context.request_context)


class RequestEventQueue(asyncio.Queue):
    def __init__(self):
        super().__init__()
        self.readers = set()

    async def get(self):
        reader = asyncio.current_task()
        self.readers.add(reader)
        try:
            return await super().get()
        finally:
            self.readers.discard(reader)

    async def close(self):
        # ChatKit's merge iterator leaves a queue reader running when the model
        # stream raises. Cancel and await only readers owned by this request.
        readers = list(self.readers)
        for reader in readers:
            reader.cancel()
        if readers:
            await asyncio.gather(*readers, return_exceptions=True)


class PortalAgentContext(AgentContext):
    _events: RequestEventQueue = PrivateAttr(default_factory=RequestEventQueue)

    async def close_stream(self):
        await self._events.close()
