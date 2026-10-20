"""Anonymous operational totals. Model usage is not a billing balance."""
import logging
import os
import anyio
from uuid import uuid4

logger = logging.getLogger(__name__)


async def record_ai_usage_event(db, *, client_id, user_id, action, provider, model,
                                status, started_at, usage=None):
    """Record one user action and its provider run without prompt or reply text."""
    if action not in {"client_ai.reply", "builder.preview"} or status not in {"succeeded", "failed", "cancelled"}:
        raise ValueError("Invalid AI usage event")
    reported = usage is not None and usage.requests > 0
    counts = (usage.input_tokens, usage.output_tokens, usage.total_tokens) if reported else (None, None, None)
    request_id = str(uuid4())
    area = "client_portal" if action == "client_ai.reply" else "aoc_admin"
    with anyio.CancelScope(shield=True):
        try:
            await db.execute("""WITH recorded AS (
                INSERT INTO portal_ai_usage_events(request_id,client_id,actor_user_id,action,provider,model,
                    status,input_tokens,output_tokens,total_tokens,started_at)
                VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT(request_id) DO NOTHING RETURNING request_id
            ) INSERT INTO portal_integration_runs(source,operation,environment,trigger_type,request_id,
                actor_user_id,client_id,portal_area,status,started_at,finished_at)
              SELECT %s,%s,%s,'request',request_id,%s,%s,%s,%s,%s,NOW() FROM recorded""",
                (request_id, client_id, user_id, action, (provider or "")[:64] or None,
                 (model or "")[:120] or None, status, *counts, started_at,
                 (provider or "ai")[:64], "client_reply" if area == "client_portal" else "builder_preview",
                 os.getenv("VERCEL_ENV", "development")[:32], user_id, client_id, area,
                 "succeeded" if status == "succeeded" else "failed", started_at))
        except Exception as error:
            logger.error("AI usage event recording failed: %s", type(error).__name__)


async def record_usage(db, source, started_at, usage=None):
    if source not in {"client", "preview"}:
        raise ValueError("Invalid usage source")
    # Agents SDK creates zero usage before any provider response. That is unknown,
    # not evidence that a failed/cancelled request incurred no charge.
    reported = int(usage is not None and usage.requests > 0)
    values = (usage.input_tokens, usage.output_tokens, usage.total_tokens) if reported else (0, 0, 0)
    with anyio.CancelScope(shield=True):
        try:
            await db.execute("""INSERT INTO portal_ai_activity_monthly
                (source,period_start,runs,reported_runs,input_tokens,output_tokens,total_tokens,first_recorded_at)
                VALUES(%s,DATE_TRUNC('month',%s::timestamptz AT TIME ZONE 'UTC')::date,1,%s,%s,%s,%s,%s)
                ON CONFLICT(source,period_start) DO UPDATE SET
                  runs=portal_ai_activity_monthly.runs+1,
                  reported_runs=portal_ai_activity_monthly.reported_runs+EXCLUDED.reported_runs,
                  input_tokens=portal_ai_activity_monthly.input_tokens+EXCLUDED.input_tokens,
                  output_tokens=portal_ai_activity_monthly.output_tokens+EXCLUDED.output_tokens,
                  total_tokens=portal_ai_activity_monthly.total_tokens+EXCLUDED.total_tokens,
                  first_recorded_at=LEAST(portal_ai_activity_monthly.first_recorded_at,EXCLUDED.first_recorded_at),
                  updated_at=NOW()""", (source, started_at, reported, *values, started_at))
        except Exception as error:
            logger.error("Portal usage recording failed: %s", type(error).__name__)
