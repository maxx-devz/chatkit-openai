"""Server-authorized client credit limits. No billing/provider secrets in payloads."""
from decimal import Decimal
from uuid import uuid4
from fastapi import HTTPException
import anyio

def deny(code, message, status=403):
    raise HTTPException(status, {"code": code, "error": message})

async def reserve_plan_reply(context):
    db = context.db
    async with db.transaction():
        ready = await (await db.execute("SELECT to_regclass('portal_client_plans') IS NOT NULL AS ready")).fetchone()
        if not ready["ready"]:
            return  # Feature is not installed; existing clients are unchanged.
        allowed = await (await db.execute("""SELECT c.id FROM portal_clients c JOIN portal_memberships m ON m.client_id=c.id
            WHERE c.id=%s AND m.user_id=%s AND m.is_active=TRUE AND c.portal_enabled=TRUE AND c.ai_enabled=TRUE
            AND m.role IN ('member','client_admin','aoc_admin') FOR SHARE OF c,m""", context.scope)).fetchone()
        if not allowed:
            deny("plan_access_revoked", "Your client access changed. Reload the portal.")
        plan = await (await db.execute("SELECT status FROM portal_client_plans WHERE client_id=%s FOR UPDATE", (context.client_id,))).fetchone()
        if not plan:
            return
        if plan["status"] != "active":
            deny("plan_paused", "Your AI plan is paused. Contact your administrator.")
        month = await (await db.execute("""SELECT period,included_credits+extra_credits-used_credits AS remaining
            FROM portal_client_plan_balances WHERE client_id=%s AND period=to_char(NOW() AT TIME ZONE 'UTC','YYYY-MM')""", (context.client_id,))).fetchone()
        if not month:
            deny("plan_payment_due", "This month’s plan needs admin payment confirmation before AI can resume.")
        pending = await (await db.execute("SELECT id FROM portal_client_plan_runs WHERE client_id=%s AND status IN ('running','review')", (context.client_id,))).fetchone()
        if pending:
            deny("plan_pending", "A reply is running or its usage needs checking. Wait, or contact your administrator.", 409)
        if Decimal(month["remaining"]) <= 0:
            deny("plan_exhausted", "Your AI credits are used up. Request more credits or a plan upgrade.")
        token = str(uuid4())
        await db.execute("INSERT INTO portal_client_plan_runs(id,client_id,period,user_id,status) VALUES(%s,%s,%s,%s,'running')", (token,context.client_id,month["period"],context.user_id))
        context.plan_run_id = token
        context.plan_provider_started = False

async def finish_plan_reply(context):
    token = getattr(context, "plan_run_id", None)
    if not token:
        return
    with anyio.CancelScope(shield=True):
        async with context.db.transaction():
            observed = await (await context.db.execute("""SELECT COUNT(*) AS events,COUNT(*) FILTER(WHERE amount_usd IS NULL OR basis='unknown') AS unknown,
                COALESCE(SUM(amount_usd),0)*1000 AS credits FROM portal_ai_cost_events WHERE client_id=%s AND request_id=%s""", (context.client_id,token))).fetchone()
            if observed["events"] and not observed["unknown"]:
                state, credits = "settled", observed["credits"]
            elif not getattr(context, "plan_provider_started", False) and not observed["events"]:
                state, credits = "settled", Decimal(0)
            else:
                state, credits = "review", None
            await context.db.execute("""UPDATE portal_client_plan_runs SET status=%s,credits_used=%s,finished_at=NOW()
                WHERE id=%s AND client_id=%s AND status='running'""", (state,credits,token,context.client_id))
