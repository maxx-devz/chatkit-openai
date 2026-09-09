"""Exercise real ChatKit SQL in session-local temporary tables, without model calls.

Uses DATABASE_URL from .env.local, but never reads or changes application rows.
One transaction pins pooled connections, and rolling it back removes all fixtures.
"""
import asyncio
from datetime import datetime, timezone
from pathlib import Path
import os
import sys

from dotenv import load_dotenv
import psycopg
from psycopg.rows import dict_row

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "chatkit_backend"))

from app import Envelope, acquire_lease, load_client, reserve_request
from chatkit.server import ChatKitServer
from chatkit.store import NotFoundError
from chatkit.types import AssistantMessageContent, AssistantMessageItem, ThreadItemDoneEvent, ThreadMetadata, UserMessageItem
from fastapi import HTTPException
from store import Context, PostgresStore


class SmokeServer(ChatKitServer):
    async def respond(self, thread, input_user_message, context):
        yield ThreadItemDoneEvent(item=AssistantMessageItem(
            id=self.store.generate_item_id("message", thread, context),
            thread_id=thread.id, created_at=datetime.now(timezone.utc),
            content=[AssistantMessageContent(text="Local protocol test reply")],
        ))


async def must_fail(awaitable, error_type, status=None):
    try:
        await awaitable
    except error_type as error:
        if status is not None:
            assert error.status_code == status
    else:
        raise AssertionError("Expected access/limit failure")


async def main():
    load_dotenv(ROOT / ".env.local")
    async with await psycopg.AsyncConnection.connect(
        os.environ["DATABASE_URL"], autocommit=False, row_factory=dict_row, connect_timeout=8,
    ) as db:
        await db.execute("""
            CREATE TEMP TABLE portal_clients (
                id BIGINT PRIMARY KEY, display_name TEXT, portal_enabled BOOLEAN DEFAULT TRUE,
                ai_enabled BOOLEAN DEFAULT TRUE, monthly_prompt_limit INTEGER DEFAULT 2,
                assistant_instructions TEXT DEFAULT '', openai_vector_store_id TEXT);
            CREATE TEMP TABLE portal_memberships (
                client_id BIGINT, user_id BIGINT, PRIMARY KEY (client_id, user_id));
            CREATE TEMP TABLE portal_ai_usage_monthly (
                client_id BIGINT, period_start DATE, requests_used INTEGER DEFAULT 0,
                input_tokens BIGINT DEFAULT 0, output_tokens BIGINT DEFAULT 0,
                total_tokens BIGINT DEFAULT 0, updated_at TIMESTAMPTZ,
                PRIMARY KEY (client_id, period_start));
        """)
        schema = (ROOT / "chatkit_backend/schema.sql").read_text()
        schema = schema.replace("BEGIN;", "").replace("COMMIT;", "")
        schema = schema.replace("SET LOCAL search_path = public, pg_temp;", "SET LOCAL search_path = pg_temp, public;")
        await db.execute(schema.replace("CREATE TABLE IF NOT EXISTS", "CREATE TEMP TABLE"))
        # Fail closed unless every table used by the checks resolves to this session's temp schema.
        tables = ["portal_clients", "portal_memberships", "portal_ai_usage_monthly",
                  "portal_chatkit_threads", "portal_chatkit_items", "portal_chatkit_leases"]
        for table in tables:
            cursor = await db.execute("SELECT relnamespace = pg_my_temp_schema() AS temporary FROM pg_class WHERE oid=%s::regclass", (table,))
            assert (await cursor.fetchone())["temporary"], "Test table was not temporary"
        await db.execute("""
            INSERT INTO portal_clients (id, display_name) VALUES (1, 'Test A'), (2, 'Test B');
            INSERT INTO portal_memberships VALUES (1, 1), (1, 2), (2, 1);
        """)
        store = PostgresStore()
        first = Context(db, "1", "1", "Test instructions", {})
        same_client = Context(db, "1", "2", "Test instructions", {})
        other_client = Context(db, "2", "1", "Test instructions", {})
        created = datetime.now(timezone.utc)
        thread = ThreadMetadata(id="thr_test", title="Test title", created_at=created)
        await store.save_thread(thread, first)
        assert (await store.load_thread(thread.id, first)).title == "Test title"
        for denied in [same_client, other_client]:
            await must_fail(store.load_thread(thread.id, denied), NotFoundError)
            await must_fail(store.delete_thread(thread.id, denied), NotFoundError)
            assert not (await store.load_threads(10, None, "desc", denied)).data
        for index in range(3):
            item = UserMessageItem(id=f"msg_{index}", thread_id=thread.id, created_at=created,
                                   content=[{"type": "input_text", "text": str(index)}],
                                   attachments=[], inference_options={})
            await store.add_thread_item(thread.id, item, first)
        page = await store.load_thread_items(thread.id, None, 2, "asc", first)
        assert [item.id for item in page.data] == ["msg_0", "msg_1"] and page.has_more
        next_page = await store.load_thread_items(thread.id, page.after, 2, "asc", first)
        assert [item.id for item in next_page.data] == ["msg_2"] and not next_page.has_more
        assert [item.id for item in (await store.load_thread_items(thread.id, None, 3, "desc", first)).data] == ["msg_2", "msg_1", "msg_0"]
        await must_fail(store.load_item(thread.id, "msg_0", other_client), NotFoundError)
        thread.title = "Renamed"
        await store.save_thread(thread, first)
        assert (await store.load_thread(thread.id, first)).title == "Renamed"
        # Use the actual ChatKit protocol dispatcher and production Store, with a local reply.
        import json
        server = SmokeServer(store)
        result = await server.process(json.dumps({"type": "threads.create", "params": {"input": {
            "content": [{"type": "input_text", "text": "Protocol smoke test"}],
            "attachments": [], "inference_options": {},
        }}}), first)
        events = [chunk async for chunk in result]
        assert any(b"Local protocol test reply" in chunk for chunk in events)
        threads = await store.load_threads(10, None, "desc", first)
        assert len(threads.data) == 2
        page = await store.load_threads(1, None, "asc", first)
        assert page.has_more and len((await store.load_threads(1, page.after, "asc", first)).data) == 1
        await acquire_lease(first, "lease-one")
        await must_fail(acquire_lease(first, "lease-two"), HTTPException, 409)
        await acquire_lease(other_client, "independent-lease")
        await reserve_request(first)
        await reserve_request(same_client)
        await must_fail(reserve_request(first), HTTPException, 429)
        await reserve_request(other_client)
        await db.execute("UPDATE portal_clients SET ai_enabled=FALSE WHERE id=2")
        await must_fail(load_client(db, Envelope(client_id="2", user_id="1", instructions="", payload={})), HTTPException, 403)
        await store.delete_thread(thread.id, first)
        await must_fail(store.load_item(thread.id, "msg_0", first), NotFoundError)
        await db.rollback()
        print("PASS: ChatKit protocol, persistence, pagination, rename/delete, tenant/user isolation, leases, shared allowance, and disabled access (temporary tables rolled back).")


if __name__ == "__main__":
    with asyncio.Runner(loop_factory=asyncio.SelectorEventLoop) as runner:
        runner.run(main())
