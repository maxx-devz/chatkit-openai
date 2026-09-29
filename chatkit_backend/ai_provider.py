"""Resolve OpenAI versus OpenRouter without exposing provider credentials."""
import os
from dataclasses import dataclass
from urllib.parse import urlsplit

from agents import set_default_openai_client
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
    api_key: str
    base_url: str | None
    model: str
    default_headers: dict[str, str]


def provider_config():
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


def active_client(**options):
    config = provider_config()
    kwargs = {"api_key": config.api_key, **options}
    if config.base_url:
        kwargs["base_url"] = config.base_url
    if config.default_headers:
        kwargs["default_headers"] = config.default_headers
    return AsyncOpenAI(**kwargs)


def configure_agents():
    config = provider_config()
    if not config.api_key:
        return
    set_default_openai_client(
        active_client(timeout=75, max_retries=2),
        use_for_tracing=False,
    )


def supports_openai_hosted_tools():
    return provider_config().name == "openai"


def has_openai_hosted_key():
    key = _value("OPENAI_API_KEY")
    return bool(key) and not is_openrouter_key(key)


def openai_hosted_client(**options):
    """Use genuine OpenAI credentials for vector stores and image generation."""
    key = _value("OPENAI_API_KEY")
    if not has_openai_hosted_key():
        return None
    return AsyncOpenAI(api_key=key, **options)
