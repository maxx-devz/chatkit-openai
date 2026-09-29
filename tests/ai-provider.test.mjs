import test from "node:test";
import assert from "node:assert/strict";

import {
  aiClientOptions,
  isOpenRouterKey,
  resolveAiProvider,
} from "../lib/ai-provider.js";

test("detects OpenRouter from an sk-or-v1 key in the legacy variable", () => {
  const provider = resolveAiProvider({
    OPENAI_API_KEY: "sk-or-v1-example",
    OPENAI_MODEL: "gpt-5.4-mini",
  });

  assert.equal(isOpenRouterKey(provider.apiKey), true);
  assert.equal(provider.id, "openrouter");
  assert.equal(provider.baseURL, "https://openrouter.ai/api/v1");
  assert.equal(provider.model, "openrouter/free");
  assert.equal(provider.supportsOpenAiHostedTools, false);
});

test("a dedicated OpenRouter key and model take precedence", () => {
  const environment = {
    OPENAI_API_KEY: "sk-proj-openai-example",
    OPENROUTER_API_KEY: "sk-or-v1-router-example",
    OPENROUTER_MODEL: "nvidia/nemotron-3-super-120b-a12b:free",
    OPENROUTER_SITE_URL: "https://portal.example.com/path",
    OPENROUTER_APP_NAME: "AOC staging",
  };
  const provider = resolveAiProvider(environment);
  const options = aiClientOptions(environment, { maxRetries: 2 });

  assert.equal(provider.id, "openrouter");
  assert.equal(provider.model, "nvidia/nemotron-3-super-120b-a12b:free");
  assert.equal(options.apiKey, environment.OPENROUTER_API_KEY);
  assert.equal(options.defaultHeaders["HTTP-Referer"], "https://portal.example.com");
  assert.equal(options.defaultHeaders["X-OpenRouter-Title"], "AOC staging");
  assert.equal(options.maxRetries, 2);
});

test("keeps sk-proj and other non-OpenRouter keys on OpenAI", () => {
  const provider = resolveAiProvider({
    OPENAI_API_KEY: "sk-proj-example",
    OPENAI_MODEL: "gpt-5.4-mini",
  });

  assert.equal(provider.id, "openai");
  assert.equal(provider.baseURL, undefined);
  assert.equal(provider.model, "gpt-5.4-mini");
  assert.equal(provider.supportsOpenAiHostedTools, true);
});
