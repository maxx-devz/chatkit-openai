"""Anonymous operational totals. Model usage is not a billing balance."""
import logging
import anyio

logger = logging.getLogger(__name__)


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
