"""Neon-backed ChatKit Store. All queries include the server-established scope."""
from dataclasses import dataclass
from uuid import uuid4

from chatkit.store import NotFoundError, Store
from chatkit.types import Page, ThreadItem, ThreadMetadata
from psycopg import AsyncConnection
from psycopg.sql import SQL
from psycopg.types.json import Jsonb
from pydantic import TypeAdapter

ITEM = TypeAdapter(ThreadItem)


@dataclass
class Context:
    db: AsyncConnection
    client_id: str
    user_id: str
    instructions: str
    client: dict
    period_start: object = None

    @property
    def scope(self):
        return (self.client_id, self.user_id)


class PostgresStore(Store[Context]):
    def generate_thread_id(self, context):
        return "thr_" + uuid4().hex

    def generate_item_id(self, item_type, thread, context):
        return item_type + "_" + uuid4().hex

    async def load_thread(self, thread_id, context):
        cursor = await context.db.execute(
            "SELECT data FROM portal_chatkit_threads WHERE client_id=%s AND user_id=%s AND id=%s",
            (*context.scope, thread_id),
        )
        row = await cursor.fetchone()
        if not row:
            raise NotFoundError("Conversation not found")
        return ThreadMetadata.model_validate(row["data"])

    async def save_thread(self, thread, context):
        await context.db.execute("""
            INSERT INTO portal_chatkit_threads (client_id, user_id, id, data, created_at)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (client_id, user_id, id) DO UPDATE SET data=EXCLUDED.data
        """, (*context.scope, thread.id, Jsonb(thread.model_dump(mode="json")), thread.created_at))

    async def load_threads(self, limit, after, order, context):
        limit = max(1, min(limit, 100))
        comparison = SQL(">") if order == "asc" else SQL("<")
        direction = SQL("ASC") if order == "asc" else SQL("DESC")
        params = [*context.scope]
        clause = SQL("")
        if after:
            await self.load_thread(after, context)
            clause = SQL("""AND (created_at, id) {} (
                SELECT created_at, id FROM portal_chatkit_threads
                WHERE client_id=%s AND user_id=%s AND id=%s)
            """).format(comparison)
            params.extend((*context.scope, after))
        params.append(limit + 1)
        cursor = await context.db.execute(SQL("""
            SELECT data FROM portal_chatkit_threads WHERE client_id=%s AND user_id=%s {}
            ORDER BY created_at {}, id {} LIMIT %s
        """).format(clause, direction, direction), params)
        rows = await cursor.fetchall()
        data = [ThreadMetadata.model_validate(row["data"]) for row in rows[:limit]]
        return Page(data=data, has_more=len(rows) > limit,
                    after=data[-1].id if len(rows) > limit else None)

    async def load_thread_items(self, thread_id, after, limit, order, context):
        await self.load_thread(thread_id, context)
        limit = max(1, min(limit, 100))
        comparison = SQL(">") if order == "asc" else SQL("<")
        direction = SQL("ASC") if order == "asc" else SQL("DESC")
        params = [*context.scope, thread_id]
        clause = SQL("")
        if after:
            await self.load_item(thread_id, after, context)
            clause = SQL("""AND sequence {} (SELECT sequence FROM portal_chatkit_items
                WHERE client_id=%s AND user_id=%s AND thread_id=%s AND id=%s)
            """).format(comparison)
            params.extend((*context.scope, thread_id, after))
        params.append(limit + 1)
        cursor = await context.db.execute(SQL("""
            SELECT data FROM portal_chatkit_items
            WHERE client_id=%s AND user_id=%s AND thread_id=%s {}
            ORDER BY sequence {} LIMIT %s
        """).format(clause, direction), params)
        rows = await cursor.fetchall()
        data = [ITEM.validate_python(row["data"]) for row in rows[:limit]]
        return Page(data=data, has_more=len(rows) > limit,
                    after=data[-1].id if len(rows) > limit else None)

    async def add_thread_item(self, thread_id, item, context):
        await self.save_item(thread_id, item, context)

    async def save_item(self, thread_id, item, context):
        if item.thread_id != thread_id:
            raise NotFoundError("Conversation not found")
        await self.load_thread(thread_id, context)
        await context.db.execute("""
            INSERT INTO portal_chatkit_items (client_id, user_id, thread_id, id, data)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (client_id, user_id, thread_id, id) DO UPDATE SET data=EXCLUDED.data
        """, (*context.scope, thread_id, item.id, Jsonb(item.model_dump(mode="json"))))

    async def load_item(self, thread_id, item_id, context):
        cursor = await context.db.execute("""
            SELECT data FROM portal_chatkit_items
            WHERE client_id=%s AND user_id=%s AND thread_id=%s AND id=%s
        """, (*context.scope, thread_id, item_id))
        row = await cursor.fetchone()
        if not row:
            raise NotFoundError("Message not found")
        return ITEM.validate_python(row["data"])

    async def delete_thread(self, thread_id, context):
        await self.load_thread(thread_id, context)
        await context.db.execute(
            "DELETE FROM portal_chatkit_threads WHERE client_id=%s AND user_id=%s AND id=%s",
            (*context.scope, thread_id),
        )

    async def delete_thread_item(self, thread_id, item_id, context):
        await self.load_item(thread_id, item_id, context)
        await context.db.execute("""
            DELETE FROM portal_chatkit_items
            WHERE client_id=%s AND user_id=%s AND thread_id=%s AND id=%s
        """, (*context.scope, thread_id, item_id))

    async def save_attachment(self, attachment, context):
        raise ValueError("Uploads are not enabled")

    async def load_attachment(self, attachment_id, context):
        raise NotFoundError("Attachment not found")

    async def delete_attachment(self, attachment_id, context):
        raise NotFoundError("Attachment not found")
