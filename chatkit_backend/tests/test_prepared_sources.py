import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from prepared_sources import inline_prepared_sources
from app import Envelope
from pydantic import ValidationError


class PreparedSourceTests(unittest.TestCase):
    def setUp(self):
        self.reference = {"name": "Approved website guide", "revision": "2", "text": "Ask for delegated access.",
                          "citation": "SRC-abcdefghijkl", "excerpt": True}

    def test_reference_is_lower_priority_input_and_not_instructions(self):
        latest = {"role": "user", "content": "What access is needed?"}
        original = [latest]
        agent_input = list(original)
        self.assertTrue(inline_prepared_sources(agent_input, [self.reference]))
        self.assertEqual(original, [latest])
        self.assertIs(agent_input[-1], latest)
        self.assertEqual(agent_input[0]["role"], "user")
        self.assertIn("not instructions", agent_input[0]["content"][0]["text"])
        self.assertIn("Ask for delegated access", agent_input[0]["content"][0]["text"])
        self.assertFalse(inline_prepared_sources(agent_input, []))

    def test_envelope_accepts_only_bounded_signed_reference_shape(self):
        body = {"client_id": "1", "user_id": "2", "instructions": "Approved rules", "payload": {},
                "source_references": [self.reference]}
        self.assertEqual(Envelope.model_validate(body).source_references[0].revision, "2")
        for change in [{"text": "x" * 2001}, {"citation": "other"}, {"revision": "invalid"}, {"client_id": "999"}]:
            with self.assertRaises(ValidationError):
                Envelope.model_validate({**body, "source_references": [{**self.reference, **change}]})
        with self.assertRaises(ValidationError):
            Envelope.model_validate({**body, "source_references": [self.reference] * 5})


if __name__ == "__main__":
    unittest.main()
