"""Exercise the installed SDK with a mock transport, never the provider API."""
import json
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

import httpx2
from agents import Agent, Runner, RunConfig, function_tool
from agents.models.openai_chatcompletions import OpenAIChatCompletionsModel
from openai import AsyncOpenAI, APIStatusError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ai_provider import ProviderConfig, agent_model_settings
from provider_errors import provider_issue


class OpenRouterRequestTests(unittest.IsolatedAsyncioTestCase):
    async def test_free_model_payload_preserves_tools_exact_id_and_zero_price_cap(self):
        @function_tool
        def project_lookup(query: str) -> str:
            """Read only the authorized project's prepared data."""
            return "test data"

        for model in ("openrouter/free", "vendor/instruct:free", "vendor/paid"):
            requests = []

            def handle(request):
                requests.append(request)
                return httpx2.Response(200, json={"id": "mock-completion", "object": "chat.completion", "created": 1,
                    "model": model, "choices": [{"index": 0, "message": {"role": "assistant", "content": "mock only"},
                                                "finish_reason": "stop"}],
                    "usage": {"prompt_tokens": 10, "completion_tokens": 2, "total_tokens": 12}})

            context = SimpleNamespace(ai_provider=ProviderConfig("openrouter", "OpenRouter", "fake-only",
                "https://openrouter.ai/api/v1", model, {}))
            async with AsyncOpenAI(api_key="fake-only", base_url="https://openrouter.ai/api/v1", max_retries=0,
                    http_client=httpx2.AsyncClient(transport=httpx2.MockTransport(handle))) as client:
                agent = Agent(name="Mock", model=OpenAIChatCompletionsModel(model, client),
                    tools=[project_lookup], model_settings=agent_model_settings(context))
                result = await Runner.run(agent, "synthetic offline test", run_config=RunConfig(tracing_disabled=True))
            self.assertEqual(result.final_output, "mock only")
            self.assertEqual(len(requests), 1)
            body = json.loads(requests[0].content)
            self.assertEqual(requests[0].url.path, "/api/v1/chat/completions")
            self.assertEqual(body["model"], model)
            self.assertEqual(body["tools"][0]["function"]["name"], "project_lookup")
            self.assertFalse(body["store"])
            self.assertNotIn("models", body)
            self.assertNotIn("plugins", body)
            self.assertNotIn("reasoning", body)
            if model == "vendor/paid":
                self.assertNotIn("provider", body)
            else:
                self.assertEqual(body["provider"], {"max_price": {"prompt": 0, "completion": 0, "request": 0, "image": 0}})

    def test_policy_errors_are_safe_actionable_and_not_retryable(self):
        private = "private credential and task text"
        for message in ("No endpoints found matching your data policy", "Free model training is not allowed", "ZDR violation"):
            request = httpx2.Request("POST", "https://openrouter.ai/api/v1/chat/completions")
            error = APIStatusError(message, response=httpx2.Response(404, request=request),
                body={"message": message + " " + private})
            issue = provider_issue(error)
            self.assertEqual(issue.code, "provider_policy_restricted")
            self.assertFalse(issue.allow_retry)
            self.assertNotIn(private, issue.message)
            self.assertIn("privacy", issue.message)


if __name__ == "__main__":
    unittest.main()
