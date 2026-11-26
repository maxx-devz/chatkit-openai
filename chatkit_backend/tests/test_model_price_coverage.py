from datetime import date
from decimal import Decimal
import unittest
from cost_tracking import observation

class PriceCoverageTests(unittest.TestCase):
    def rate(self, inputs=10907, outputs=160, cached=0, **kwargs):
        return observation("openai","gpt-5.6-sol",{"input_tokens":inputs,"output_tokens":outputs,
            "input_tokens_details":{"cached_tokens":cached}},today=date(2026,11,26),**kwargs)
    def test_actual_model_and_cache_breakdown_use_verified_rates(self):
        first=self.rate();second=self.rate(11090,114,10904)
        self.assertEqual(first["amount"]+second["amount"],Decimal("0.054213600000"))
        self.assertEqual(first["basis"],"estimated")
        self.assertEqual(first["pricing"]["verifiedAt"],"2026-11-26")
        self.assertIn("gpt-5.6-sol",first["pricing"]["source"])
        self.assertFalse(first["pricing"]["cacheWriteFieldReported"])
    def test_promotional_rate_is_not_used_before_or_after_its_verified_window(self):
        raw={"input_tokens":100,"output_tokens":10,"input_tokens_details":{"cached_tokens":0}}
        for day,reason in [(date(2026,11,25),"model_price_not_verified"),(date(2026,12,1),"pricing_review_required")]:
            row=observation("openai","gpt-5.6-sol",raw,today=day)
            self.assertIsNone(row["amount"]);self.assertEqual(row["reason"],reason)
        self.assertEqual(observation("openai","gpt-5.6-sol",raw,today=date(2026,11,28))["basis"],"estimated")
    def test_missing_or_inconsistent_cache_counts_are_not_guessed(self):
        for cached in [None,20000,-1]:
            self.assertIsNone(self.rate(cached=cached)["amount"])
    def test_long_context_and_cache_write_rates_remain_distinct(self):
        raw={"input_tokens":300000,"output_tokens":100,"input_tokens_details":{"cached_tokens":1000,"cache_write_tokens":2000}}
        row=observation("openai","gpt-5.6-sol",raw,today=date(2026,11,26))
        self.assertEqual(row["amount"],Decimal("2.399800000000"))
        self.assertTrue(row["pricing"]["longContext"])
        self.assertTrue(row["pricing"]["cacheWriteFieldReported"])
    def test_unverified_models_and_specialized_charges_still_remain_unknown(self):
        self.assertIsNone(observation("openai","unknown-model",{},today=date(2026,11,26))["amount"])
        self.assertIsNone(self.rate(kind="hosted_tool")["amount"])
