import os
import sys
import unittest
from pathlib import Path
from unittest.mock import sentinel, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ai_provider import configure_agents, is_openrouter_key, provider_config


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

    def test_openrouter_agents_use_chat_completions_without_hidden_retries(self):
        with patch.dict(os.environ, {
            "OPENAI_API_KEY": "",
            "OPENROUTER_API_KEY": "sk-or-v1-example",
            "OPENROUTER_MODEL": "openrouter/free",
        }, clear=False), patch("ai_provider.active_client", return_value=sentinel.client) as client, \
                patch("ai_provider.set_default_openai_api") as api, \
                patch("ai_provider.set_default_openai_client") as default_client:
            configure_agents()

        api.assert_called_once_with("chat_completions")
        client.assert_called_once_with(timeout=75, max_retries=0)
        default_client.assert_called_once_with(sentinel.client, use_for_tracing=False)

    def test_openai_agents_keep_responses_and_bounded_retries(self):
        with patch.dict(os.environ, {
            "OPENAI_API_KEY": "sk-proj-example",
            "OPENAI_MODEL": "gpt-5.4-mini",
            "OPENROUTER_API_KEY": "",
            "OPENROUTER_MODEL": "",
        }, clear=False), patch("ai_provider.active_client", return_value=sentinel.client) as client, \
                patch("ai_provider.set_default_openai_api") as api, \
                patch("ai_provider.set_default_openai_client") as default_client:
            configure_agents()

        api.assert_called_once_with("responses")
        client.assert_called_once_with(timeout=75, max_retries=2)
        default_client.assert_called_once_with(sentinel.client, use_for_tracing=False)


if __name__ == "__main__":
    unittest.main()
