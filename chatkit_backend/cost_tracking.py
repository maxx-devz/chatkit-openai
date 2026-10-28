"""Client-scoped, append-only USD observations. Estimates are never invoices."""
import json
import logging
import re
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path
from uuid import uuid4

import anyio
from psycopg.types.json import Jsonb

logger = logging.getLogger(__name__)
CATALOG = json.loads(Path(__file__).with_name("price_catalog.json").read_text(encoding="utf-8"))


def count(value):
    return value if type(value) is int and 0 <= value <= 10**12 else None


def money(value):
    if isinstance(value, bool) or value is None:
        return None
    try:
        result = Decimal(str(value))
        if not result.is_finite() or not 0 <= result < Decimal("1000000000"):
            return None
        return result.quantize(Decimal("0.000000000001"), rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError, TypeError):
        return None


def observation(provider, model, raw_usage, *, kind="chat", today=None, api=None):
    raw = raw_usage if isinstance(raw_usage, dict) else {}
    result = {"provider": provider, "model": str(model or "unknown")[:200], "kind": kind,
              "basis": "unknown", "amount": None, "input_tokens": None, "output_tokens": None,
              "cached_tokens": None, "reason": "usage_not_reported", "pricing": {}}
    decision = api == "decisions"
    if decision:
        result["pricing"] = {"endpoint": "/v1/decisions"}
    if provider == "openrouter" and "cost" in raw:
        reported = money(raw["cost"])
        if reported is not None:
            result.update(basis="reported", amount=reported, reason="provider_reported_charge",
                          pricing={"source": "OpenRouter usage.cost", "currency": "USD"})
            return result
    inputs = count(raw.get("input_tokens", raw.get("prompt_tokens")))
    outputs = count(raw.get("output_tokens", raw.get("completion_tokens")))
    details = raw.get("input_tokens_details", raw.get("prompt_tokens_details")) or {}
    if not isinstance(details, dict):
        details = {}
    cached = count(details.get("cached_tokens"))
    # Older APIs omit the newer cache-write field. This is recorded explicitly
    # in the estimate assumptions, not represented as provider-reported money.
    writes = count(details.get("cache_write_tokens", 0))
    result.update(input_tokens=inputs, output_tokens=outputs, cached_tokens=cached)
    if kind != "chat":
        result["reason"] = "usage_not_reported" if kind == "unreported" else "specialized_charge_requires_reconciliation"
        return result
    if provider != "openai":
        result["reason"] = "provider_did_not_report_cost"
        return result
    canonical = re.sub(r"-\d{4}-\d{2}-\d{2}$", "", result["model"])
    rate = CATALOG["models"].get(canonical)
    # Decisions supports only the exact Luna model used by our router. Its
    # output is not charged; never apply Responses' output rate to this call.
    if decision:
        rate = CATALOG.get("decisions", {}).get(result["model"])
    if not rate:
        result["reason"] = "model_price_not_verified"
        return result
    if (today or datetime.now(timezone.utc).date()) > date.fromisoformat(CATALOG["reviewAfter"]):
        result["reason"] = "pricing_review_required"
        return result
    if None in (inputs, outputs, cached, writes) or cached + writes > inputs:
        return result
    long_context = inputs > rate["longContextThreshold"]
    input_factor = Decimal(rate["longInputMultiplier"]) if long_context else Decimal(1)
    output_factor = Decimal(rate["longOutputMultiplier"]) if long_context else Decimal(1)
    amount = ((Decimal(inputs-cached-writes) * Decimal(rate["inputPerMillion"])
               + Decimal(cached) * Decimal(rate["cachedPerMillion"])
               + Decimal(writes) * Decimal(rate["cacheWritePerMillion"])) * input_factor
              + Decimal(outputs) * Decimal(rate["outputPerMillion"]) * output_factor) / Decimal(1000000)
    result.update(basis="estimated", amount=money(amount), reason="published_standard_token_rates",
                  pricing={"version": CATALOG["version"], "source": (
                      "https://developers.openai.com/api/docs/guides/decisions" if decision else CATALOG["source"]),
                           **({"endpoint": "/v1/decisions"} if decision else {}),
                           "verifiedAt": CATALOG["verifiedAt"], "currency": "USD", "rate": rate,
                           "longContext": long_context, "cacheWriteTokens": writes,
                           "cacheWriteFieldReported": "cache_write_tokens" in details})
    return result


async def record_run_costs(context, result, *, request_id, started_at, status):
    # Staff previews/admin requests are not automatically billed to a client.
    if getattr(context, "preview", False) or not getattr(context, "client_id", None):
        return
    provider = getattr(getattr(context, "ai_provider", None), "name", "openai")
    if provider not in ("openai", "openrouter"):
        return
    rows = []
    responses = getattr(result, "raw_responses", []) or []
    for response in responses:
        rows.append(observation(provider, context.ai_model, getattr(response, "raw_usage", None)))
        for output in getattr(response, "output", []) or []:
            if getattr(output, "type", "") in ("web_search_call", "file_search_call", "code_interpreter_call", "image_generation_call"):
                rows.append(observation(provider, context.ai_model, None, kind="hosted_tool"))
    expected = getattr(getattr(getattr(result, "context_wrapper", None), "usage", None), "requests", 0)
    if not responses or expected > len(responses) or status != "succeeded":
        # Partial/cancelled calls can still incur charges. Never convert missing
        # final usage into a zero-cost success or a complete total.
        rows.append(observation(provider, context.ai_model, None, kind="unreported"))
    rows.extend(observation(item["provider"], item["model"], item.get("usage"), kind=item["kind"], api=item.get("api"))
                for item in getattr(context, "cost_events", []))
    with anyio.CancelScope(shield=True):
        try:
            values = []
            for index, row in enumerate(rows):
                values.extend((f"{request_id}:{index}", request_id, context.client_id, row["provider"], row["model"],
                               row["kind"], status, row["basis"], row["amount"], row["input_tokens"],
                               row["output_tokens"], row["cached_tokens"], row["reason"], Jsonb(row["pricing"]), started_at))
            placeholders = ",".join(["(" + ",".join(["%s"] * 15) + ")"] * len(rows))
            async with context.db.transaction():
                await context.db.execute("""INSERT INTO portal_ai_cost_events
                    (event_key,request_id,client_id,provider,model,kind,status,basis,amount_usd,
                     input_tokens,output_tokens,cached_tokens,reason,pricing_snapshot,occurred_at) VALUES """
                    + placeholders + " ON CONFLICT(event_key) DO NOTHING", tuple(values))
        except Exception as error:
            logger.error("Client cost ledger recording failed: %s", type(error).__name__)


def new_cost_request_id():
    return str(uuid4())
