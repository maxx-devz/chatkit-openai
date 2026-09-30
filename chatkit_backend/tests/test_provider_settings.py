import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch, sentinel

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ai_provider import ProviderConfig, agent_model, provider_config, supports_openai_hosted_tools
from provider_settings import unseal_provider_key, load_provider_settings, close_provider_clients

SECRET = "unit-test-secret-32-characters-long"
# Produced by the actual Node sealProviderKey implementation; not a real credential.
SEALED = "v1.CrnVeIm5o3xNqbtJ.jRwa9o3G-g_BuiJd2HgsBQ.P5NoD9Cy26qf-vgPCChpXkQqLRGIQFE"


class ProviderSettingsTests(unittest.IsolatedAsyncioTestCase):
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


if __name__ == "__main__":
    unittest.main()
