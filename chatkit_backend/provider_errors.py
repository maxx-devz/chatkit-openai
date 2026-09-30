"""Curated client messages for provider failures, including HTTP 200 streams."""
from dataclasses import dataclass

from openai import APIError


@dataclass(frozen=True)
class ProviderIssue:
    code: str
    message: str
    allow_retry: bool


CONTACT = "Please contact Always Open Commerce."
ISSUES = {
    "provider_policy_restricted": ProviderIssue(
        "provider_policy_restricted",
        "The AI provider's privacy or routing policy blocks the selected model. "
        "An AOC administrator needs to select an allowed site-wide model or review the provider settings.",
        False,
    ),
    "credit_balance_exhausted": ProviderIssue(
        "credit_balance_exhausted",
        "AI replies are unavailable because the configured provider credits are exhausted. "
        "Provider code: credit_balance_exhausted. " + CONTACT,
        False,
    ),
    "insufficient_quota": ProviderIssue(
        "insufficient_quota",
        "AI replies are unavailable because the configured provider reached an API quota or billing limit. "
        "Provider code: insufficient_quota. " + CONTACT,
        False,
    ),
    "rate_limit_exceeded": ProviderIssue(
        "rate_limit_exceeded",
        "The AI service is receiving too many requests. Please wait a moment, then retry.",
        True,
    ),
    "authentication_failed": ProviderIssue(
        "authentication_failed",
        "The AI provider connection needs attention. " + CONTACT,
        False,
    ),
    "model_unavailable": ProviderIssue(
        "model_unavailable",
        "The AI service cannot access the selected provider model or resource. " + CONTACT,
        False,
    ),
    "request_failed": ProviderIssue(
        "request_failed",
        "The assistant could not finish this reply. Please try again.",
        True,
    ),
}
ALIASES = {
    "billing_hard_limit_reached": "insufficient_quota",
    "billing_not_active": "insufficient_quota",
    "invalid_api_key": "authentication_failed",
    "model_not_found": "model_unavailable",
}


def provider_issue(error: Exception) -> ProviderIssue:
    # A streaming APIError has a code but no status_code. Check the code first;
    # never infer exhausted credits from HTTP 429 or match raw error messages.
    if not isinstance(error, APIError):
        return ISSUES["request_failed"]
    # OpenRouter uses HTTP 404 for policy exclusions as well as missing models.
    # Classify only its known diagnostic phrases; never forward raw provider text.
    body = error.body if isinstance(error.body, dict) else {}
    message = body.get("message")
    if (getattr(error, "status_code", None) == 404
            and error.request.url.host == "openrouter.ai" and isinstance(message, str)
            and any(marker in message.lower() for marker in (
                "zdr violation", "no endpoints found matching your data policy",
                "matching your guardrail restrictions and data policy",
            ))):
        return ISSUES["provider_policy_restricted"]
    code = error.code
    if isinstance(code, str):
        code = ALIASES.get(code, code)
        if code in ISSUES:
            return ISSUES[code]
    status = getattr(error, "status_code", None)
    if status == 429:
        return ISSUES["rate_limit_exceeded"]
    if status == 401:
        return ISSUES["authentication_failed"]
    if status in (403, 404):
        return ISSUES["model_unavailable"]
    return ISSUES["request_failed"]
