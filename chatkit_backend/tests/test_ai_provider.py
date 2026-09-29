import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ai_provider import is_openrouter_key, provider_config


class AiProviderTests(unittest.TestCase):
    def test_legacy_openai_variable_detects_openrouter_prefix(self):
        with patch.dict(os.environ, {
            "OPENAI_API_KEY": "sk-or-v1-example",
            "OPENAI_MODEL": "gpt-5.4-mini",
            "OPENROUTER_API_KEY": "",
            "OPENROUTER_MODEL": "",
        }, clear=False):
            config = provider_config()
            self.assertTrue(is_openrouter_key(config.api_key))
            self.assertEqual(config.name, "openrouter")
            self.assertEqual(config.base_url, "https://openrouter.ai/api/v1")
            self.assertEqual(config.model, "openrouter/free")

    def test_project_key_remains_on_openai(self):
        with patch.dict(os.environ, {
            "OPENAI_API_KEY": "sk-proj-example",
            "OPENAI_MODEL": "gpt-5.4-mini",
            "OPENROUTER_API_KEY": "",
        }, clear=False):
            config = provider_config()
            self.assertEqual(config.name, "openai")
            self.assertIsNone(config.base_url)
            self.assertEqual(config.model, "gpt-5.4-mini")


if __name__ == "__main__":
    unittest.main()
