import sys
import unittest
from contextlib import asynccontextmanager
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from cost_tracking import CATALOG, money, observation, record_run_costs


def tokens(inputs=1000, outputs=500, cached=200, writes=100):
    return {"input_tokens": inputs, "output_tokens": outputs,
            "input_tokens_details": {"cached_tokens": cached, "cache_write_tokens": writes}}


def priced(raw, **kwargs):
    return observation("openai", "gpt-6-luna", raw, today=date(2026, 10, 28), **kwargs)


class PriceTests(unittest.TestCase):
    def test_exact_decimal_cache_reads_writes_and_output(self):
        row = priced(tokens())
        self.assertEqual(row["basis"], "estimated")
        self.assertEqual(row["amount"], Decimal("0.000334500000"))
        self.assertEqual(row["pricing"]["rate"]["inputPerMillion"], "0.10")

    def test_long_context_applies_to_full_individual_request(self):
        self.assertEqual(priced(tokens(300000, 1000, 0, 0))["amount"], Decimal("0.060750000000"))
        self.assertEqual(priced(tokens(200000, 1000, 0, 0))["amount"] * 2, Decimal("0.041000000000"))

    def test_unknown_invalid_and_absent_usage_is_not_zero(self):
        for raw in [None, {}, tokens(cached=-1), tokens(writes=True), tokens(cached=2000), tokens(inputs="1000")]:
            self.assertIsNone(priced(raw)["amount"])
            self.assertEqual(priced(raw)["basis"], "unknown")

    def test_no_cache_write_field_is_an_explicit_estimate_assumption(self):
        raw = tokens(writes=0)
        del raw["input_tokens_details"]["cache_write_tokens"]
        row = priced(raw)
        self.assertEqual(row["basis"], "estimated")
        self.assertFalse(row["pricing"]["cacheWriteFieldReported"])

    def test_unverified_model_and_expired_rates_do_not_get_invented_prices(self):
        self.assertEqual(observation("openai", "new-model", tokens())["reason"], "model_price_not_verified")
        self.assertEqual(observation("openai", "gpt-6-luna", tokens(), today=date(2027, 1, 1))["reason"], "pricing_review_required")

    def test_snapshot_model_names_use_verified_base_price(self):
        self.assertEqual(observation("openai", "gpt-6-luna-2026-10-01", tokens(), today=date(2026, 10, 28))["amount"], priced(tokens())["amount"])

    def test_openrouter_reported_cost_is_preserved_including_genuine_zero(self):
        for cost in ["0.001234567891", 0]:
            row = observation("openrouter", "vendor/actual-model", {"cost": cost})
            self.assertEqual(row["basis"], "reported")
            self.assertEqual(row["amount"], Decimal(str(cost)))
        for cost in [False, -1, "NaN", "Infinity", "invalid", None]:
            self.assertEqual(observation("openrouter", "vendor/model", {"cost": cost})["basis"], "unknown")

    def test_specialized_charges_are_unknown_not_fabricated(self):
        for kind in ["image", "hosted_tool", "indexing"]:
            row = priced(tokens(), kind=kind)
            self.assertEqual(row["basis"], "unknown")
            self.assertIsNone(row["amount"])

    def test_decisions_use_verified_input_cache_rates_and_no_output_charge(self):
        row = priced(tokens(), api="decisions")
        self.assertEqual(row["amount"], Decimal("0.000084500000"))
        self.assertEqual(row["pricing"]["endpoint"], "/v1/decisions")
        self.assertEqual(row["pricing"]["rate"]["outputPerMillion"], "0")
        self.assertIn("guides/decisions", row["pricing"]["source"])
        self.assertEqual(row["output_tokens"], 500)

    def test_decision_missing_usage_and_unverified_prices_remain_unknown(self):
        row = priced(None, api="decisions")
        self.assertIsNone(row["amount"])
        self.assertEqual(row["pricing"]["endpoint"], "/v1/decisions")
        self.assertEqual(observation("openai", "other", tokens(), api="decisions")["reason"], "model_price_not_verified")
        self.assertEqual(observation("openai", "gpt-6-luna", tokens(), api="decisions",
                                     today=date(2027, 1, 1))["reason"], "pricing_review_required")

    def test_money_rejects_nonfinite_negative_and_out_of_range_values(self):
        for value in [True, "NaN", "Infinity", "-0.01", 1000000000, None]:
            self.assertIsNone(money(value))


class FakeDatabase:
    def __init__(self, fail=False):
        self.fail = fail
        self.rows = {}
        self.queries = []

    @asynccontextmanager
    async def transaction(self):
        yield

    async def execute(self, query, params):
        self.queries.append((query, params))
        if self.fail:
            raise RuntimeError("synthetic private connection")
        assert "ON CONFLICT(event_key) DO NOTHING" in query
        for start in range(0, len(params), 15):
            row = params[start:start+15]
            self.rows.setdefault(row[0], row)


class LedgerTests(unittest.IsolatedAsyncioTestCase):
    def context(self, **kwargs):
        return SimpleNamespace(db=FakeDatabase(), client_id="7", ai_model="gpt-6-luna", preview=False,
                               ai_provider=SimpleNamespace(name="openai"), cost_events=[], **kwargs)

    async def record(self, context, responses=None, requests=None, status="succeeded"):
        responses = responses if responses is not None else [SimpleNamespace(raw_usage=tokens(), output=[])]
        run = SimpleNamespace(raw_responses=responses, context_wrapper=SimpleNamespace(usage=SimpleNamespace(requests=requests if requests is not None else len(responses))))
        with patch.dict(CATALOG, {"reviewAfter": "2099-01-01"}):
            await record_run_costs(context, run, request_id="00000000-0000-0000-0000-000000000007",
                                   started_at=datetime.now(timezone.utc), status=status)

    async def test_records_each_call_separately_in_one_bulk_write(self):
        context = self.context()
        response = SimpleNamespace(raw_usage=tokens(), output=[])
        await self.record(context, [response, response])
        self.assertEqual(len(context.db.rows), 2)
        self.assertEqual(len(context.db.queries), 1)
        self.assertTrue(all(row[2] == "7" for row in context.db.rows.values()))
        self.assertEqual(sum(row[8] for row in context.db.rows.values()), Decimal("0.000669000000"))

    async def test_idempotent_keys_prevent_double_counting(self):
        context = self.context()
        await self.record(context)
        await self.record(context)
        self.assertEqual(len(context.db.rows), 1)

    async def test_decisions_cost_is_separate_and_not_double_counted_with_reply(self):
        context = self.context()
        context.cost_events = [{"provider": "openai", "model": "gpt-6-luna", "kind": "chat",
                                "api": "decisions", "usage": tokens()}]
        await self.record(context)
        rows = list(context.db.rows.values())
        self.assertEqual(len(rows), 2)
        self.assertEqual(sum(row[8] for row in rows), Decimal("0.000419000000"))
        self.assertEqual(rows[1][13].obj["endpoint"], "/v1/decisions")

    async def test_failed_decision_attempt_is_not_a_zero_charge(self):
        context = self.context()
        context.cost_events = [{"provider": "openai", "model": "gpt-6-luna", "kind": "chat",
                                "api": "decisions", "usage": None}]
        await self.record(context)
        row = list(context.db.rows.values())[-1]
        self.assertEqual(row[7:9], ("unknown", None))
        self.assertEqual(row[13].obj["endpoint"], "/v1/decisions")

    async def test_missing_final_usage_and_partial_requests_remain_incomplete(self):
        for status in ["failed", "cancelled"]:
            context = self.context()
            await self.record(context, status=status)
            self.assertEqual(len(context.db.rows), 2)
            self.assertEqual(list(context.db.rows.values())[-1][7:9], ("unknown", None))
        context = self.context()
        await self.record(context, requests=2)
        self.assertEqual(len(context.db.rows), 2)

    async def test_hosted_tools_images_and_indexing_are_flagged_unpriced(self):
        context = self.context()
        context.cost_events = [{"provider": "openai", "model": "gpt-image-2", "kind": "image"},
                               {"provider": "openai", "model": "vector-store-indexing", "kind": "indexing"}]
        await self.record(context, [SimpleNamespace(raw_usage=tokens(), output=[SimpleNamespace(type="web_search_call")])])
        self.assertEqual(len(context.db.rows), 4)
        self.assertEqual(sum(row[7] == "unknown" for row in context.db.rows.values()), 3)

    async def test_preview_activity_is_not_billed_to_clients(self):
        context = self.context()
        context.preview = True
        await self.record(context)
        self.assertEqual(context.db.rows, {})

    async def test_raw_payloads_and_credentials_are_never_persisted(self):
        context = self.context()
        raw = {**tokens(), "private_field": "synthetic-secret"}
        await self.record(context, [SimpleNamespace(raw_usage=raw, output=[])])
        self.assertNotIn("synthetic-secret", repr(context.db.queries))

    async def test_recording_failure_does_not_replace_a_delivered_reply(self):
        context = self.context()
        context.db.fail = True
        with self.assertLogs("cost_tracking", level="ERROR") as logs:
            await self.record(context)
        self.assertNotIn("synthetic private connection", " ".join(logs.output))


if __name__ == "__main__":
    unittest.main()
