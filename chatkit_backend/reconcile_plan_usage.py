"""Explicit, audited reconciliation of a completed, unpriced client reply.

Never called by a GET or automatically waives unknown successful usage. Original
provider observations stay immutable. This estimates the client debit; it is not
a provider invoice or a claim that the provider reported a dollar charge.
"""
from datetime import timezone
from decimal import Decimal
import hashlib
import json
import re
from uuid import UUID

from psycopg.types.json import Jsonb
from cost_tracking import observation, money


def identifiers(client_id, run_id):
    if not re.fullmatch(r"[1-9][0-9]{0,18}", str(client_id)):
        raise ValueError("An exact client ID is required")
    return str(client_id), str(UUID(str(run_id)))


async def preview_usage_reconciliation(db, client_id, run_id):
    client_id, run_id = identifiers(client_id, run_id)
    run = await (await db.execute("""SELECT r.status,r.period,r.started_at,
        EXISTS(SELECT 1 FROM portal_ai_usage_events u WHERE u.client_id=r.client_id
          AND u.request_id=r.id AND u.status='succeeded') AS succeeded
        FROM portal_client_plan_runs r WHERE r.client_id=%s AND r.id=%s""", (client_id, run_id))).fetchone()
    if not run or run["status"] != "review" or not run["succeeded"]:
        raise ValueError("This exact client reply is not a completed usage-review incident")
    rows = await (await db.execute("""SELECT event_key,provider,model,kind,status,basis,
        amount_usd,input_tokens,output_tokens,cached_tokens,reason,pricing_snapshot,occurred_at
        FROM portal_ai_cost_events WHERE client_id=%s AND request_id=%s ORDER BY event_key""",
        (client_id, run_id))).fetchall()
    if not rows or len(rows) > 50:
        raise ValueError("A complete bounded set of recorded cost events is required")
    estimates = []
    original = []
    total = Decimal(0)
    for row in rows:
        original.append({key: str(value) for key,value in row.items()})
        if row["status"] != "succeeded":
            raise ValueError("An unsuccessful or mixed-outcome request cannot be priced here")
        if row["basis"] in ("reported", "estimated") and row["amount_usd"] is not None:
            amount = money(row["amount_usd"])
            if amount is None:
                raise ValueError("Invalid existing provider cost")
            total += amount
            continue
        if (row["provider"] != "openai" or row["kind"] != "chat"
                or row["basis"] != "unknown" or row["reason"] != "model_price_not_verified"
                or row["pricing_snapshot"]):
            raise ValueError("This incident needs independent evidence, not a token-price estimate")
        raw = {key: row[key] for key in ("input_tokens", "output_tokens")}
        raw["input_tokens_details"] = {"cached_tokens": row["cached_tokens"]}
        pricing_date = row["occurred_at"].astimezone(timezone.utc).date()
        rated = observation("openai", row["model"], raw, today=pricing_date)
        if rated["basis"] != "estimated" or rated["amount"] is None:
            raise ValueError("Verified rates and complete token/cache counts are required for the activity date")
        total += rated["amount"]
        estimates.append({"eventKey": row["event_key"], "model": row["model"],
            "inputTokens": row["input_tokens"], "outputTokens": row["output_tokens"],
            "cachedTokens": row["cached_tokens"], "amountUsd": str(rated["amount"]),
            "basis": "estimated", "pricing": rated["pricing"]})
    if not estimates or total > Decimal("1000000"):
        raise ValueError("No safe token-price reconciliation is available")
    credits = total * 1000
    digest = hashlib.sha256(json.dumps({"clientId": client_id,"runId": run_id,
        "events": original,"estimates": estimates},sort_keys=True,separators=(",", ":")).encode()).hexdigest()
    return {"clientId": client_id,"runId": run_id,"period": run["period"],
        "estimatedProviderUsd": str(total),"clientCredits": str(credits),
        "basis": "estimated","digest": digest,"estimates": estimates}


async def apply_usage_reconciliation(db, client_id, run_id, actor_id, expected_digest, expected_credits):
    client_id, run_id = identifiers(client_id, run_id)
    if not re.fullmatch(r"[1-9][0-9]{0,18}", str(actor_id)) or not re.fullmatch(r"[a-f0-9]{64}", expected_digest):
        raise ValueError("Active admin and exact preview digest are required")
    async with db.transaction():
        actor = await (await db.execute("SELECT user_id FROM portal_admins WHERE user_id=%s AND is_active FOR SHARE", (actor_id,))).fetchone()
        if not actor:
            raise ValueError("Active administrator required")
        if (await (await db.execute("SELECT to_regclass('portal_internal_users') IS NOT NULL AS ready")).fetchone())["ready"]:
            if await (await db.execute("SELECT 1 FROM portal_internal_users WHERE user_id=%s", (actor_id,))).fetchone():
                raise ValueError("Internal Portal account cannot authorize a client-plan correction")
        await db.execute("SELECT client_id FROM portal_client_plans WHERE client_id=%s FOR UPDATE", (client_id,))
        run = await (await db.execute("SELECT status,credits_used FROM portal_client_plan_runs WHERE id=%s AND client_id=%s FOR UPDATE", (run_id, client_id))).fetchone()
        if not run:
            raise ValueError("Reply unavailable for this client")
        if run["status"] == "settled":
            audit = await (await db.execute("""SELECT 1 FROM portal_client_plan_audit
                WHERE client_id=%s AND action='reply_usage_recovered'
                  AND details->>'runId'=%s AND details->>'digest'=%s""",
                (client_id, run_id, expected_digest))).fetchone()
            if not audit or str(run["credits_used"]) != str(Decimal(expected_credits).quantize(Decimal("0.000000000001"))):
                raise ValueError("Already settled by a different decision")
            return {"applied": False,"duplicate": True,"clientId": client_id,"runId": run_id}
        preview = await preview_usage_reconciliation(db, client_id, run_id)
        if preview["digest"] != expected_digest or Decimal(preview["clientCredits"]) != Decimal(expected_credits):
            raise ValueError("Evidence or rates changed; preview and approval must be renewed")
        await db.execute("""UPDATE portal_client_plan_runs SET status='settled',credits_used=%s,
            finished_at=COALESCE(finished_at,NOW()) WHERE client_id=%s AND id=%s AND status='review'""",
            (Decimal(preview["clientCredits"]),client_id,run_id))
        await db.execute("""INSERT INTO portal_client_plan_audit(client_id,actor_id,action,reason,details)
            VALUES(%s,%s,'reply_usage_recovered','Completed reply estimated from recorded tokens and verified standard rates',%s)""",
            (client_id,str(actor_id),Jsonb({**preview,"clientBilling": "estimated_recorded_usage",
                "providerExpense": "original observations retained; estimate is not a provider-reported invoice"})))
        return {"applied": True,"duplicate": False,**preview}
