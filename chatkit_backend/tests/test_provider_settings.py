import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch, sentinel

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ai_provider import ProviderConfig, agent_model, agent_model_settings, provider_config, supports_openai_hosted_tools
from provider_settings import unseal_provider_key, load_provider_settings, close_provider_clients, ProviderSettingsError

SECRET = "unit-test-secret-32-characters-long"
# Produced by the actual Node sealProviderKey implementation; not a real credential.
SEALED = "v1.CrnVeIm5o3xNqbtJ.jRwa9o3G-g_BuiJd2HgsBQ.P5NoD9Cy26qf-vgPCChpXkQqLRGIQFE"


class ProviderSettingsTests(unittest.IsolatedAsyncioTestCase):
    async def test_missing_encryption_secret_is_a_safe_actionable_configuration_error(self):
        db = AsyncMock()
        db.execute.return_value.fetchall.return_value = [{"provider": "openrouter", "encrypted_key": SEALED, "model": "x", "active": True}]
        with patch.dict(os.environ, {"PROVIDER_SETTINGS_SECRET": ""}):
            with self.assertRaises(ProviderSettingsError) as raised:
                await load_provider_settings(db)
            self.assertEqual(raised.exception.code, "provider_encryption_missing")
            self.assertNotIn(SEALED, str(raised.exception))

    def test_node_encryption_is_readable_by_python(self):
        self.assertEqual(unseal_provider_key("openrouter", SEALED, SECRET), "sk-or-v1-unit-test-only")
        for provider, secret in [("openai", SECRET), ("openrouter", SECRET + "x")]:
            with self.assertRaises(Exception):
                unseal_provider_key(provider, SEALED, secret)

    async def test_saved_keys_and_model_override_environment_and_refresh(self):
        rows = [{"provider": "openrouter", "encrypted_key": SEALED, "model": "vendor/saved:free", "active": True}]
        db = AsyncMock()
        db.execute.return_value.fetchall.return_value = rows
        with patch.dict(os.environ, {"PROVIDER_SETTINGS_SECRET": SECRET, "OPENAI_API_KEY": "wrong-environment-key"}):
            first = await load_provider_settings(db)
            self.assertEqual(first.api_key, "sk-or-v1-unit-test-only")
            self.assertEqual(first.model, "vendor/saved:free")
            rows[0]["generation_options"] = {"model": "vendor/saved:free", "reasoningEffort": "low"}
            self.assertEqual((await load_provider_settings(db)).generation_options["reasoningEffort"], "low")
            self.assertNotIn(first.api_key, repr(first))
            rows[0]["model"] = "vendor/new-selection:free"
            second = await load_provider_settings(db)
            self.assertEqual(second.model, "vendor/new-selection:free")
            self.assertEqual(first.model, "vendor/saved:free")

    async def test_corrupt_credentials_do_not_silently_fall_back(self):
        db = AsyncMock()
        db.execute.return_value.fetchall.return_value = [{"provider": "openrouter", "encrypted_key": "bad", "model": "x", "active": True}]
        with patch.dict(os.environ, {"PROVIDER_SETTINGS_SECRET": SECRET}):
            with self.assertRaises(ValueError):
                await load_provider_settings(db)

    def test_request_scoped_providers_never_change_sdk_global_defaults(self):
        for provider, model in [("openrouter", "openai/literal-model-id"), ("openai", "gpt-test")]:
            context = SimpleNamespace(ai_provider=ProviderConfig(provider, provider, "fake", None, model, {}))
            with patch("ai_provider.active_client", return_value=sentinel.client), \
                    patch("ai_provider.OpenAIProvider") as factory, \
                    patch("ai_provider.set_default_openai_client") as global_client:
                agent_model(context=context)
                factory.assert_called_once_with(openai_client=sentinel.client, use_responses=provider == "openai")
                factory.return_value.get_model.assert_called_once_with(model)
                global_client.assert_not_called()
                self.assertEqual(provider_config(context).name, provider)
                self.assertEqual(supports_openai_hosted_tools(context), provider == "openai")

    async def test_request_clients_are_closed_once(self):
        client = AsyncMock()
        context = SimpleNamespace(ai_client=client, hosted_client=None)
        await close_provider_clients(context)
        await close_provider_clients(context)
        client.close.assert_awaited_once()

    def test_reasoning_is_model_bound_and_uses_provider_specific_parameters(self):
        for provider in ("openai", "openrouter"):
            model = "gpt-6-luna" if provider == "openai" else "vendor/reasoning:free"
            for effort in ("low", "medium", "high", "auto", "invalid"):
                config = ProviderConfig(provider, provider, "synthetic-key", None, model, {},
                                        generation_options={"model": model, "reasoningEffort": effort})
                context = SimpleNamespace(ai_provider=config)
                settings = agent_model_settings(context)
                self.assertFalse(settings.store)
                self.assertFalse(settings.parallel_tool_calls)
                self.assertTrue(settings.preserve_raw_usage)
                if effort not in ("auto", "invalid"):
                    if provider == "openai":
                        self.assertEqual(settings.reasoning.effort, effort)
                        self.assertIsNone(settings.extra_body)
                    else:
                        self.assertEqual(settings.extra_body, {"reasoning": {"effort": effort}})
                        self.assertIsNone(settings.reasoning)
                else:
                    self.assertIsNone(settings.reasoning)
                    self.assertIsNone(settings.extra_body)
            for new_model in ("gpt-unknown", "openrouter/free"):
                context.ai_provider = ProviderConfig(provider, provider, "synthetic-key", None, new_model, {},
                    generation_options={"model": model, "reasoningEffort": "high"})
                self.assertIsNone(agent_model_settings(context).reasoning)
                self.assertIsNone(agent_model_settings(context).extra_body)


if __name__ == "__main__":
    unittest.main()
