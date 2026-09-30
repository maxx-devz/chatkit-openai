"""Resolve OpenAI versus OpenRouter without exposing provider credentials."""
import os
from dataclasses import dataclass, field
from urllib.parse import urlsplit

from agents import set_default_openai_api, set_default_openai_client
from agents.models.openai_provider import OpenAIProvider
from openai import AsyncOpenAI

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
OPENROUTER_KEY_PREFIX = "sk-or-v1-"
OPENAI_DEFAULT_MODEL = "gpt-5.4-mini"
OPENROUTER_DEFAULT_MODEL = "openrouter/free"


def _value(name):
    return os.getenv(name, "").strip()


def is_openrouter_key(key):
    return isinstance(key, str) and key.strip().startswith(OPENROUTER_KEY_PREFIX)


@dataclass(frozen=True)
class ProviderConfig:
    name: str
    label: str
    api_key: str = field(repr=False)
    base_url: str | None
    model: str
    default_headers: dict[str, str]
    openai_key: str = field(default="", repr=False)


def provider_config(context=None):
    saved = getattr(context, "ai_provider", None)
    if isinstance(saved, ProviderConfig):
        return saved
    dedicated_key = _value("OPENROUTER_API_KEY")
    legacy_key = _value("OPENAI_API_KEY")
    openrouter = bool(dedicated_key) or is_openrouter_key(legacy_key)
    key = (dedicated_key or legacy_key) if openrouter else legacy_key
    legacy_model = _value("OPENAI_MODEL")
    model = (
        _value("OPENROUTER_MODEL")
        or (legacy_model if "/" in legacy_model else "")
        or OPENROUTER_DEFAULT_MODEL
    ) if openrouter else legacy_model or OPENAI_DEFAULT_MODEL
    headers = {}
    if openrouter:
        site_url = _value("OPENROUTER_SITE_URL") or _value("BETTER_AUTH_URL")
        try:
            parsed = urlsplit(site_url)
            if parsed.scheme in ("http", "https") and parsed.netloc:
                headers["HTTP-Referer"] = f"{parsed.scheme}://{parsed.netloc}"
        except ValueError:
            pass
        headers["X-OpenRouter-Title"] = (
            _value("OPENROUTER_APP_NAME") or "Always Open Commerce Portal"
        )[:120]
    return ProviderConfig(
        name="openrouter" if openrouter else "openai",
        label="OpenRouter" if openrouter else "OpenAI",
        api_key=key,
        base_url=OPENROUTER_BASE_URL if openrouter else None,
        model=model,
        default_headers=headers,
    )


def active_client(context=None, **options):
    config = provider_config(context)
    kwargs = {"api_key": config.api_key, "base_url": config.base_url or "https://api.openai.com/v1", **options}
    if config.default_headers:
        kwargs["default_headers"] = config.default_headers
    return AsyncOpenAI(**kwargs)


def configure_agents():
    config = provider_config()
    if not config.api_key:
        return
    # OpenRouter's most mature compatibility surface for streamed function
    # tools is Chat Completions. The Agents SDK otherwise defaults to Responses,
    # which can fail after ChatKit has already stored the user's message. Keep
    # genuine OpenAI traffic on the recommended Responses path.
    set_default_openai_api(
        "chat_completions" if config.name == "openrouter" else "responses"
    )
    set_default_openai_client(
        active_client(
            timeout=75,
            # A free OpenRouter failure can count toward its daily allowance.
            # Let ChatKit expose one retry action instead of silently spending
            # up to three provider requests for one user prompt.
            max_retries=0 if config.name == "openrouter" else 2,
        ),
        use_for_tracing=False,
    )


def supports_openai_hosted_tools(context=None):
    return provider_config(context).name == "openai"


def agent_model(model=None, context=None):
    config = provider_config(context)
    selected_model = model or config.model
    if isinstance(getattr(context, "ai_provider", None), ProviderConfig):
        context.ai_client = active_client(context, timeout=75, max_retries=0 if config.name == "openrouter" else 2)
        return OpenAIProvider(openai_client=context.ai_client,
                              use_responses=config.name == "openai").get_model(selected_model)
    if config.name == "openrouter":
        # Agent(model="vendor/name") invokes MultiProvider prefix routing.
        # OpenRouter IDs are literal model names: preserve the entire ID,
        # including openai/ IDs, on our configured Chat Completions client.
        return OpenAIProvider(use_responses=False).get_model(selected_model)
    return selected_model


def has_openai_hosted_key(context=None):
    if isinstance(getattr(context, "ai_provider", None), ProviderConfig):
        return bool(context.ai_provider.openai_key)
    key = _value("OPENAI_API_KEY")
    return bool(key) and not is_openrouter_key(key)


def openai_hosted_client(context=None, **options):
    """Use genuine OpenAI credentials for vector stores and image generation."""
    key = (context.ai_provider.openai_key if isinstance(getattr(context, "ai_provider", None), ProviderConfig)
           else _value("OPENAI_API_KEY"))
    if not has_openai_hosted_key(context):
        return None
    if context is not None and getattr(context, "hosted_client", None):
        return context.hosted_client
    if context is not None:
        context.hosted_client = AsyncOpenAI(api_key=key, base_url="https://api.openai.com/v1", **options)
        return context.hosted_client
    return AsyncOpenAI(api_key=key, base_url="https://api.openai.com/v1", **options)
