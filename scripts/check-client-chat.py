"""Live two-turn ChatKit check: synthetic messages, no client data or DB writes.

Run explicitly: .venv/Scripts/python scripts/check-client-chat.py
Uses two (or more if the model invokes tools) provider requests at normal rates.
Reads only the site-wide model selection from the configured database.
"""
import asyncio
import json
import os
import sys
from itertools import count
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env.local")
sys.path.insert(0, str(ROOT / "chatkit_backend"))

from assistant import PortalChatKitServer
from chatkit.types import Page
from database import connect_database
from provider_errors import provider_issue
from provider_settings import load_provider_settings
from store import Context, PostgresStore


async def main():
    async with await connect_database(os.environ["DATABASE_URL"]) as db:
        config = await load_provider_settings(db)
        model = config.model
    print(json.dumps({"provider": config.name, "model": model}), flush=True)
    store = MagicMock(spec=PostgresStore)
    ids, items, threads = count(), [], {}
    store.generate_thread_id.return_value = "thr_diagnostic"
    store.generate_item_id.side_effect = lambda kind, *args: f"{kind}_{next(ids)}"

    async def save_item(thread_id, item, context):
        items[:] = [saved for saved in items if saved.id != item.id]
        items.append(type(item).model_validate_json(item.model_dump_json()))

    async def save_thread(thread, context):
        threads[thread.id] = type(thread).model_validate_json(thread.model_dump_json())

    async def load_thread(thread_id, context):
        return threads[thread_id]

    async def load_items(*args, **kwargs):
        return Page(data=list(reversed(items)))

    store.add_thread_item.side_effect = store.save_item.side_effect = save_item
    store.save_thread.side_effect = save_thread
    store.load_thread.side_effect = load_thread
    store.load_thread_items.side_effect = load_items
    context = Context(AsyncMock(), "1", "1", "Synthetic connectivity test. Do not call tools.",
                      {"display_name": "Connectivity test"}, ai_model=model, ai_provider=config)
    server = PortalChatKitServer(store)
    prompts = ["Remember the reference word MARIGOLD. Reply exactly OK. Do not call tools.",
               "What reference word did I give you? Reply with only that word. Do not call tools."]
    for index, prompt in enumerate(prompts):
        params = {"input": {"content": [{"type": "input_text", "text": prompt}],
                            "attachments": [], "inference_options": {}}}
        if index:
            params["thread_id"] = "thr_diagnostic"
        with patch("assistant.provider_issue", wraps=provider_issue) as failure:
            stream = await server.process(json.dumps({
                "type": "threads.add_user_message" if index else "threads.create", "params": params,
            }).encode(), context)
            wire = b"".join([chunk async for chunk in stream]).decode()
        events = [json.loads(part.removeprefix("data: ")) for part in wire.strip().split("\n\n")]
        if failure.called:
            error = failure.call_args.args[0]
            print(json.dumps({"turn": index + 1, "error": type(error).__name__,
                              "code": provider_issue(error).code}), flush=True)
            return 1
        replies = [event["item"] for event in events if event["type"] == "thread.item.done"
                   and event["item"]["type"] == "assistant_message"]
        text = " ".join(part["text"] for reply in replies for part in reply["content"])
        remembered = "MARIGOLD" in text.upper() if index else None
        print(json.dumps({"turn": index + 1, "replyCompleted": bool(replies),
                          "rememberedReferenceWord": remembered}), flush=True)
        if not replies or (index and not remembered):
            return 1
        saved_replies = [item for item in items if item.type == "assistant_message"]
        unique_history = (len(saved_replies) == index + 1
                          and len({item.id for item in saved_replies}) == index + 1
                          and all(item.id != "__fake_id__" for item in saved_replies))
        print(json.dumps({"turn": index + 1, "separateSavedReplies": unique_history}), flush=True)
        if not unique_history:
            return 1
    return 0


if __name__ == "__main__":
    with asyncio.Runner(loop_factory=asyncio.SelectorEventLoop) as runner:
        raise SystemExit(runner.run(main()))
