"""Signed, staff-only draft tests. Never write to client ChatKit threads."""
import asyncio
import os
from datetime import datetime, timezone

import psycopg
from agents import Runner, RunConfig
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from psycopg.rows import dict_row
from pydantic import BaseModel, ConfigDict, Field
from typing import Literal

from assistant import make_agent
from builder_config import AssistantConfig
from security import verify_signature
from store import Context
from usage_tracking import record_usage

router = APIRouter()
HEADERS = {"Cache-Control": "private, no-store"}


class PreviewMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=12000)


class PreviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    client_id: str = Field(pattern=r"^[1-9][0-9]{0,18}$")
    user_id: str = Field(pattern=r"^[1-9][0-9]{0,18}$")
    revision: int = Field(ge=1)
    instructions: str = Field(max_length=20000)
    portal_origin: str = Field(max_length=300)
    messages: list[PreviewMessage] = Field(min_length=1, max_length=12)


@router.post("/builder-preview")
async def preview(request: Request):
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > 150000:
            return JSONResponse({"error": "Preview too large"}, 413, headers=HEADERS)
    if not verify_signature(bytes(body), request.headers.get("x-chatkit-timestamp", ""),
                            request.headers.get("x-chatkit-signature", ""), os.getenv("CHATKIT_BACKEND_SECRET", "")):
        return JSONResponse({"error": "Unauthorized"}, 401, headers=HEADERS)
    try:
        data = PreviewRequest.model_validate_json(body)
        if data.messages[-1].role != "user" or sum(len(item.content) for item in data.messages) > 30000:
            raise ValueError("Invalid preview messages")
    except ValueError:
        return JSONResponse({"error": "Invalid preview"}, 400, headers=HEADERS)
    try:
        async with asyncio.timeout(95):
            async with await psycopg.AsyncConnection.connect(os.environ["DATABASE_URL"], autocommit=True,
                    row_factory=dict_row, connect_timeout=8, options="-c statement_timeout=10000") as db:
                # Verify staff status independently even though Next.js signed this request.
                cursor = await db.execute("SELECT user_id FROM portal_admins WHERE user_id=%s AND is_active=TRUE", (data.user_id,))
                if not await cursor.fetchone():
                    return JSONResponse({"error": "Staff access required"}, 403, headers=HEADERS)
                cursor = await db.execute("""SELECT c.*,b.draft,b.revision FROM portal_clients c
                    JOIN portal_assistant_configs b ON b.client_id=c.id WHERE c.id=%s""", (data.client_id,))
                client = await cursor.fetchone()
                if not client or client["revision"] != data.revision:
                    return JSONResponse({"error": "Save or reload the draft before testing"}, 409, headers=HEADERS)
                cursor = await db.execute("""INSERT INTO portal_assistant_preview_usage(user_id,period_start,attempts)
                    VALUES(%s,DATE_TRUNC('hour',NOW()),1) ON CONFLICT(user_id,period_start) DO UPDATE
                    SET attempts=portal_assistant_preview_usage.attempts+1
                    WHERE portal_assistant_preview_usage.attempts < 20 RETURNING attempts""", (data.user_id,))
                if not await cursor.fetchone():
                    return JSONResponse({"error": "Staff preview allowance reached (20 replies per hour)"}, 429, headers=HEADERS)
                await db.execute("DELETE FROM portal_assistant_files WHERE user_id=%s AND preview=TRUE AND created_at < NOW()-INTERVAL '24 hours'", (data.user_id,))
                context = Context(db, data.client_id, data.user_id, data.instructions, client,
                    config=AssistantConfig.model_validate(client["draft"]).model_dump(), preview=True,
                    portal_origin=data.portal_origin.rstrip("/"))
                started_at = datetime.now(timezone.utc)
                result = Runner.run_streamed(make_agent(context), [item.model_dump() for item in data.messages],
                    context=context, max_turns=5, run_config=RunConfig(tracing_disabled=True, trace_include_sensitive_data=False))
                try:
                    async for _ in result.stream_events():
                        pass
                finally:
                    if not result.is_complete:
                        result.cancel()
                    await record_usage(db, "preview", started_at, result.context_wrapper.usage)
                return JSONResponse({"text": str(result.final_output), "files": context.artifacts}, headers=HEADERS)
    except Exception:
        # API/provider/database exceptions can contain prompts or configuration.
        return JSONResponse({"error": "Preview could not finish. Check the Python service, model access and API billing, then try again."}, 503, headers=HEADERS)
