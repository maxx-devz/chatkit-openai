"""Private FastAPI backend for the Next.js /api/chatkit proxy."""
import asyncio
import json
import logging
import os
from uuid import uuid4

import anyio
from chatkit.server import StreamingResult
from chatkit.store import NotFoundError
from chatkit.types import ChatKitReq, ErrorEvent, UserMessageItem
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, ValidationError

from assistant import PortalChatKitServer
from security import verify_signature
from store import Context, PostgresStore
from builder_config import load_config
from database import connect_database
from preview import router as preview_router

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
app.include_router(preview_router)
store = PostgresStore()
server = PortalChatKitServer(store)
logger = logging.getLogger(__name__)
NO_STORE = {"Cache-Control": "private, no-store", "X-Accel-Buffering": "no"}
GENERATE = {"threads.create", "threads.add_user_message", "threads.retry_after_item"}
MUTATE = GENERATE | {"threads.update", "threads.delete"}
ALLOWED = MUTATE | {"threads.list", "threads.get_by_id", "items.list"}


class Envelope(BaseModel):
    model_config = ConfigDict(extra="forbid")
    client_id: str = Field(pattern=r"^[1-9][0-9]{0,18}$")
    user_id: str = Field(pattern=r"^[1-9][0-9]{0,18}$")
    instructions: str = Field(max_length=20_000)
    portal_origin: str = Field(default="", max_length=300)
    payload: dict


def validate_payload(payload):
    parsed = TypeAdapter(ChatKitReq).validate_python(payload)
    if parsed.type not in ALLOWED:
        raise ValueError("Unsupported chat operation")
    message = getattr(parsed.params, "input", None)
    if message is not None:
        if message.attachments or message.inference_options.model or message.inference_options.tool_choice:
            raise ValueError("Client model overrides and uploads are not enabled")
        if any(part.type != "input_text" for part in message.content):
            raise ValueError("Only text messages are enabled")
        text = "".join(part.text for part in message.content)
        if not text.strip() or len(text) + len(message.quoted_text or "") > 12_000:
            raise ValueError("Invalid message length")
    limit = getattr(parsed.params, "limit", None)
    if limit is not None:
        if limit < 1:
            raise ValueError("Invalid page size")
        # ChatKit requests 9999 threads on startup. Return a bounded page with
        # the Store's has_more/after cursor instead of rejecting the request.
        parsed.params.limit = min(limit, 100)
    title = getattr(parsed.params, "title", None)
    if title is not None and (not title.strip() or len(title) > 160):
        raise ValueError("Invalid title")
    return parsed


async def load_client(db, envelope):
    cursor = await db.execute("""
        SELECT client.* FROM portal_clients AS client
        JOIN portal_memberships AS member ON member.client_id=client.id
        WHERE client.id=%s AND member.user_id=%s
          AND client.portal_enabled=TRUE AND client.ai_enabled=TRUE
    """, (envelope.client_id, envelope.user_id))
    client = await cursor.fetchone()
    if not client:
        raise HTTPException(403, "Assistant access is unavailable")
    return client


async def reserve_request(context):
    # Enforce the same client-wide monthly budget as the existing administrator UI.
    cursor = await context.db.execute("""
        INSERT INTO portal_ai_usage_monthly (client_id, period_start, requests_used, updated_at)
        SELECT id, DATE_TRUNC('month', NOW() AT TIME ZONE 'UTC')::date, 1, NOW()
        FROM portal_clients WHERE id=%s AND portal_enabled=TRUE AND ai_enabled=TRUE
          AND monthly_prompt_limit>=1
        ON CONFLICT (client_id, period_start) DO UPDATE
          SET requests_used=portal_ai_usage_monthly.requests_used+1, updated_at=NOW()
          WHERE portal_ai_usage_monthly.requests_used < (
            SELECT monthly_prompt_limit FROM portal_clients
            WHERE id=%s AND portal_enabled=TRUE AND ai_enabled=TRUE)
        RETURNING period_start
    """, (context.client_id, context.client_id))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(429, "Monthly allowance reached")
    context.period_start = row["period_start"]


async def acquire_lease(context, token):
    cursor = await context.db.execute("""
        INSERT INTO portal_chatkit_leases (client_id, user_id, token, expires_at)
        VALUES (%s, %s, %s, NOW()+INTERVAL '180 seconds')
        ON CONFLICT (client_id, user_id) DO UPDATE
          SET token=EXCLUDED.token, expires_at=EXCLUDED.expires_at
          WHERE portal_chatkit_leases.expires_at < NOW()
        RETURNING token
    """, (*context.scope, token))
    if not await cursor.fetchone():
        raise HTTPException(409, "Another request is still running")


async def cleanup(db, context, token):
    with anyio.CancelScope(shield=True):
        try:
            if context and token:
                await db.execute("""
                    DELETE FROM portal_chatkit_leases WHERE client_id=%s AND user_id=%s AND token=%s
                """, (*context.scope, token))
        except Exception as error:
            logger.error("ChatKit lease cleanup failed: %s", type(error).__name__)
        finally:
            await db.close()


@app.get("/health")
async def health():
    return {"status": "ok", "service": "aoc-chatkit"}


@app.post("/chatkit")
async def chatkit(request: Request):
    secret = os.getenv("CHATKIT_BACKEND_SECRET", "")
    if len(secret) < 32:
        return JSONResponse({"error": "Backend is not configured"}, status_code=503, headers=NO_STORE)
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > 150_000:
            return JSONResponse({"error": "Request too large"}, status_code=413, headers=NO_STORE)
    if not verify_signature(bytes(body), request.headers.get("x-chatkit-timestamp", ""),
                            request.headers.get("x-chatkit-signature", ""), secret):
        return JSONResponse({"error": "Unauthorized"}, status_code=401, headers=NO_STORE)
    try:
        envelope = Envelope.model_validate_json(body)
        parsed = validate_payload(envelope.payload)
    except (ValidationError, ValueError):
        return JSONResponse({"error": "Invalid chat request"}, status_code=400, headers=NO_STORE)
    if not os.getenv("DATABASE_URL"):
        return JSONResponse({"error": "Backend is not configured"}, status_code=503, headers=NO_STORE)

    db = None
    context = None
    token = None
    streaming = False
    try:
        db = await connect_database(os.environ["DATABASE_URL"])
        client = await load_client(db, envelope)
        context = Context(db, envelope.client_id, envelope.user_id, envelope.instructions, client)
        context.config = await load_config(db, client)
        context.portal_origin = envelope.portal_origin.rstrip("/")
        if parsed.type in MUTATE:
            token = uuid4().hex
            await acquire_lease(context, token)
        thread_id = getattr(parsed.params, "thread_id", None)
        if thread_id:
            await store.load_thread(thread_id, context)
        if parsed.type == "threads.retry_after_item":
            item = await store.load_item(thread_id, parsed.params.item_id, context)
            if not isinstance(item, UserMessageItem):
                raise HTTPException(400, "Retry requires a user message")
        if parsed.type in GENERATE:
            if not os.getenv("OPENAI_API_KEY"):
                raise HTTPException(503, "Backend is not configured")
            await reserve_request(context)
        # Strip unused browser metadata before handing the request to the SDK.
        data = parsed.model_dump(mode="json")
        data["metadata"] = {}
        result = await server.process(json.dumps(data), context)
        if isinstance(result, StreamingResult):
            async def events():
                try:
                    async with asyncio.timeout(95):
                        async for event in result:
                            yield event
                except asyncio.CancelledError:
                    raise
                except Exception as error:
                    logger.error("ChatKit stream failed: %s", type(error).__name__)
                    event = ErrorEvent(message="The reply was interrupted. Please try again.", allow_retry=True)
                    yield ("data: " + event.model_dump_json() + "\n\n").encode()
                finally:
                    await cleanup(db, context, token)
            streaming = True
            return StreamingResponse(events(), media_type="text/event-stream", headers=NO_STORE)
        return Response(result.json, media_type="application/json", headers=NO_STORE)
    except NotFoundError:
        return JSONResponse({"error": "Conversation not found"}, status_code=404, headers=NO_STORE)
    except HTTPException as error:
        return JSONResponse({"error": error.detail}, status_code=error.status_code, headers=NO_STORE)
    except Exception as error:
        logger.error("ChatKit request failed: %s", type(error).__name__)
        return JSONResponse({"error": "Assistant unavailable"}, status_code=503, headers=NO_STORE)
    finally:
        if db and not streaming:
            await cleanup(db, context, token)
