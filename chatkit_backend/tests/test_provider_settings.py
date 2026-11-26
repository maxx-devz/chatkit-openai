import os
import base64
import hashlib
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch, sentinel

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ai_provider import ProviderConfig, agent_model, agent_model_settings, provider_config, supports_openai_hosted_tools
from provider_settings import unseal_provider_key, load_provider_settings, close_provider_clients, ProviderSettingsError
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

SECRET = "unit-test-secret-32-characters-long"
# Produced by the actual Node sealProviderKey implementation; not a real credential.
SEALED = "v1.CrnVeIm5o3xNqbtJ.jRwa9o3G-g_BuiJd2HgsBQ.P5NoD9Cy26qf-vgPCChpXkQqLRGIQFE"


def seal_fixture(provider, value):
    iv = bytes(range(12))
    encrypted = AESGCM(hashlib.sha256(SECRET.encode()).digest()).encrypt(
        iv, value.encode(), f"aoc-provider:{provider}:v1".encode())
    encode = lambda value: base64.urlsafe_b64encode(value).decode().rstrip("=")
    return ".".join(("v1", encode(iv), encode(encrypted[-16:]), encode(encrypted[:-16])))


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

    async def test_inactive_corrupt_openrouter_key_does_not_block_active_openai(self):
        db = AsyncMock()
        db.execute.return_value.fetchall.return_value = [
            {"provider": "openrouter", "encrypted_key": "old-unreadable-key", "model": "unused", "active": False},
            {"provider": "openai", "encrypted_key": seal_fixture("openai", "synthetic-openai-key"), "model": "saved-model", "active": True},
        ]
        with patch.dict(os.environ, {"PROVIDER_SETTINGS_SECRET": SECRET}):
            config = await load_provider_settings(db)
        self.assertEqual(config.name, "openai")
        self.assertEqual(config.api_key, "synthetic-openai-key")
        self.assertEqual(config.openai_key, config.api_key)
        self.assertEqual(config.model, "saved-model")
        self.assertNotIn(config.api_key, repr(config))

    async def test_unreadable_optional_openai_key_disables_hosted_tools_not_router_chat(self):
        db = AsyncMock()
        db.execute.return_value.fetchall.return_value = [
            {"provider": "openrouter", "encrypted_key": SEALED, "model": "vendor/saved:free", "active": True},
            {"provider": "openai", "encrypted_key": "old-unreadable-key", "model": "unused", "active": False},
        ]
        with patch.dict(os.environ, {"PROVIDER_SETTINGS_SECRET": SECRET, "OPENAI_API_KEY": "must-not-substitute"}):
            config = await load_provider_settings(db)
        self.assertEqual(config.name, "openrouter")
        self.assertEqual(config.api_key, "sk-or-v1-unit-test-only")
        self.assertEqual(config.openai_key, "")

    async def test_readable_optional_openai_key_is_preserved_for_router_hosted_tools(self):
        db = AsyncMock()
        db.execute.return_value.fetchall.return_value = [
            {"provider": "openrouter", "encrypted_key": SEALED, "model": "vendor/saved:free", "active": True},
            {"provider": "openai", "encrypted_key": seal_fixture("openai", "synthetic-hosted-key"), "model": "unused", "active": False},
        ]
        with patch.dict(os.environ, {"PROVIDER_SETTINGS_SECRET": SECRET}):
            config = await load_provider_settings(db)
        self.assertEqual(config.openai_key, "synthetic-hosted-key")
        self.assertEqual(config.api_key, "sk-or-v1-unit-test-only")

    async def test_bad_selected_key_never_uses_a_readable_inactive_key_or_environment_fallback(self):
        db = AsyncMock()
        db.execute.return_value.fetchall.return_value = [
            {"provider": "openrouter", "encrypted_key": "old-unreadable-key", "model": "selected", "active": True},
            {"provider": "openai", "encrypted_key": seal_fixture("openai", "synthetic-hosted-key"), "model": "unused", "active": False},
        ]
        with patch.dict(os.environ, {"PROVIDER_SETTINGS_SECRET": SECRET, "OPENROUTER_API_KEY": "must-not-substitute"}):
            with self.assertRaises(ProviderSettingsError) as raised:
                await load_provider_settings(db)
        self.assertEqual(raised.exception.code, "provider_credentials_unreadable")
        self.assertNotIn("synthetic-hosted-key", str(raised.exception))

    async def test_database_failure_is_not_treated_as_a_credential_or_fallback_success(self):
        db = AsyncMock()
        db.execute.side_effect = RuntimeError("database offline")
        with self.assertRaisesRegex(RuntimeError, "database offline"):
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
                free_guard = {"provider": {"max_price": {"prompt": 0, "completion": 0, "request": 0, "image": 0}}} if provider == "openrouter" else {}
                self.assertFalse(settings.store)
                self.assertFalse(settings.parallel_tool_calls)
                self.assertTrue(settings.preserve_raw_usage)
                if effort not in ("auto", "invalid"):
                    if provider == "openai":
                        self.assertEqual(settings.reasoning.effort, effort)
                        self.assertIsNone(settings.extra_body)
                    else:
                        self.assertEqual(settings.extra_body, {**free_guard, "reasoning": {"effort": effort}})
                        self.assertIsNone(settings.reasoning)
                else:
                    self.assertIsNone(settings.reasoning)
                    self.assertEqual(settings.extra_body, free_guard or None)
            for new_model in ("gpt-unknown", "openrouter/free"):
                context.ai_provider = ProviderConfig(provider, provider, "synthetic-key", None, new_model, {},
                    generation_options={"model": model, "reasoningEffort": "high"})
                self.assertIsNone(agent_model_settings(context).reasoning)
                self.assertEqual(agent_model_settings(context).extra_body,
                                 free_guard if provider == "openrouter" and new_model == "openrouter/free" else None)





class ReportingProjectBindingTests(unittest.IsolatedAsyncioTestCase):
    async def test_chat_headers_follow_the_saved_project_and_ignore_a_rotated_key_binding(self):
        key = "synthetic-chat-key"
        for fingerprint, expected in [(hashlib.sha256(key.encode()).hexdigest(), {"OpenAI-Organization": "org-A", "OpenAI-Project": "proj_A"}), ("0" * 64, {})]:
            db = AsyncMock()
            db.execute.return_value.fetchall.return_value = [{"provider": "openai", "encrypted_key": seal_fixture("openai", key), "model": "synthetic", "active": True, "reporting_binding": {"chatKeyHash": fingerprint, "organizationId": "org-A", "projectId": "proj_A"}}]
            with patch.dict(os.environ, {"PROVIDER_SETTINGS_SECRET": SECRET}):
                config = await load_provider_settings(db)
            self.assertEqual(config.default_headers, expected)

if __name__ == "__main__":
    unittest.main()
