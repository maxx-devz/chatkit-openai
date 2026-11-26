"""Safe operational diagnostics and non-billing policy for unsuccessful replies.

Provider expense remains in the immutable cost ledger. Zero client credit debit
is a portal service decision, not a claim that the provider charged zero.
"""
import re
from psycopg.types.json import Jsonb
from provider_errors import provider_issue

SAFE_CODES = {"insufficient_quota", "credit_balance_exhausted", "rate_limit_exceeded",
    "authentication_failed", "model_unavailable", "provider_policy_restricted", "request_failed",
    "provider_configuration_failed", "request_timeout", "connection_failed", "reply_interrupted", "usage_unavailable", "slow_down", "server_is_overloaded",
    "billing_hard_limit_reached", "billing_not_active", "organization_spend_limit_exceeded",
    "project_spend_limit_exceeded", "organization_usage_limit_exceeded"}

def failure_diagnostic(error):
    from openai import APITimeoutError, APIConnectionError, APIError
    code = "request_timeout" if isinstance(error, APITimeoutError) else "connection_failed" if isinstance(error, APIConnectionError) else provider_issue(error).code
    raw_code = getattr(error,"code",None)
    diagnostic = {"code": raw_code if isinstance(raw_code,str) and raw_code in SAFE_CODES else code if code in SAFE_CODES else "request_failed"}
    if isinstance(error, APIError):
        status = getattr(error, "status_code", None)
        if type(status) is int and 100 <= status <= 599:
            diagnostic["httpStatus"] = status
        identifier = getattr(error, "request_id", None)
        if isinstance(identifier, str) and re.fullmatch(r"req_[A-Za-z0-9_-]{1,120}", identifier):
            diagnostic["providerRequestId"] = identifier
    return diagnostic

def safe_diagnostic(context, fallback):
    raw = getattr(context, "plan_failure", {})
    raw = raw if isinstance(raw, dict) else {}
    code = raw.get("code")
    result = {"code": code if isinstance(code,str) and code in SAFE_CODES else fallback}
    if type(raw.get("httpStatus")) is int and 100 <= raw["httpStatus"] <= 599:
        result["httpStatus"] = raw["httpStatus"]
    identifier = raw.get("providerRequestId")
    if isinstance(identifier, str) and re.fullmatch(r"req_[A-Za-z0-9_-]{1,120}", identifier):
        result["providerRequestId"] = identifier
    provider = getattr(getattr(context, "ai_provider", None), "name", None)
    if provider in ("openai", "openrouter"):
        result["provider"] = provider
    return result

async def recover_unsuccessful_runs(context):
    # Called under the client's existing plan row lock, never by a report GET.
    # Hard-stopped workers have no final event. They expire beyond the 95-second
    # stream deadline and 180-second lease and are not billed to the client.
    # A delivered successful reply is not waived merely because cleanup crashed.
    # Recover its complete recorded cost once; never manufacture missing usage.
    await context.db.execute("""WITH reconciled AS (
        UPDATE portal_client_plan_runs r SET status='settled',finished_at=COALESCE(r.finished_at,NOW()),
          credits_used=(SELECT SUM(e.amount_usd)*1000 FROM portal_ai_cost_events e WHERE e.request_id=r.id AND e.client_id=r.client_id)
        WHERE r.client_id=%s AND r.status='running' AND r.started_at<NOW()-INTERVAL '3 minutes'
          AND EXISTS(SELECT 1 FROM portal_ai_usage_events u WHERE u.request_id=r.id AND u.client_id=r.client_id AND u.status='succeeded')
          AND EXISTS(SELECT 1 FROM portal_ai_cost_events e WHERE e.request_id=r.id AND e.client_id=r.client_id)
          AND NOT EXISTS(SELECT 1 FROM portal_ai_cost_events e WHERE e.request_id=r.id AND e.client_id=r.client_id AND (e.amount_usd IS NULL OR e.basis='unknown'))
        RETURNING r.id,r.client_id
    ) INSERT INTO portal_client_plan_audit(client_id,actor_id,action,reason,details)
      SELECT client_id,%s,'reply_usage_recovered','Completed reply settled from recorded provider usage',
        jsonb_build_object('runId',id::text,'clientBilling','recorded_usage') FROM reconciled""",(context.client_id,str(context.user_id)))
    await context.db.execute("""WITH released AS (
        UPDATE portal_client_plan_runs r SET status='settled',credits_used=0,finished_at=COALESCE(r.finished_at,NOW())
        WHERE r.client_id=%s AND ((r.status='running' AND r.started_at<NOW()-INTERVAL '3 minutes'
            AND NOT EXISTS(SELECT 1 FROM portal_ai_usage_events u WHERE u.request_id=r.id AND u.client_id=r.client_id AND u.status='succeeded'))
          OR (r.status='review' AND EXISTS(SELECT 1 FROM portal_ai_usage_events u
            WHERE u.request_id=r.id AND u.client_id=r.client_id AND u.status IN ('failed','cancelled'))))
        RETURNING r.id,r.client_id
    ) INSERT INTO portal_client_plan_audit(client_id,actor_id,action,reason,details)
      SELECT client_id,%s,'reply_recovered','Unsuccessful or interrupted reply not billed to client',
        jsonb_build_object('runId',id::text,'code','reply_interrupted','clientCreditsCharged',0)
      FROM released""", (context.client_id,str(context.user_id)))

async def finish_with_audit(context, state, credits, outcome):
    diagnostic = safe_diagnostic(context,"usage_unavailable" if state=='review' else "reply_interrupted")
    details = {**diagnostic,"runId":context.plan_run_id,"outcome":outcome,
               "clientBilling":"pending" if state=='review' else "not_billed"}
    # A retry cannot change a settled run or append duplicate audit records.
    await context.db.execute("""WITH finished AS (
        UPDATE portal_client_plan_runs SET status=%s,credits_used=%s,finished_at=NOW()
        WHERE id=%s AND client_id=%s AND status='running' RETURNING client_id
    ) INSERT INTO portal_client_plan_audit(client_id,actor_id,action,reason,details)
      SELECT client_id,%s,%s,%s,%s FROM finished""",(state,credits,context.plan_run_id,context.client_id,
        str(context.user_id),'reply_usage_unavailable' if state=='review' else 'reply_failed',
        'Completed reply usage recording needs technical attention' if state=='review' else 'Unsuccessful reply not billed to client',Jsonb(details)))
