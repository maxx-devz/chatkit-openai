"""Curated client messages for OpenAI failures, including errors inside HTTP 200 streams."""
from dataclasses import dataclass

from openai import APIError


@dataclass(frozen=True)
class ProviderIssue:
    code: str
    message: str
    allow_retry: bool


CONTACT = "Please contact Always Open Commerce."
ISSUES = {
    "credit_balance_exhausted": ProviderIssue(
        "credit_balance_exhausted",
        "AI replies are unavailable because the service's OpenAI API credits are exhausted. " + CONTACT,
        False,
    ),
    "insufficient_quota": ProviderIssue(
        "insufficient_quota",
        "AI replies are unavailable because the service has reached an OpenAI API quota or billing limit. " + CONTACT,
        False,
    ),
    "rate_limit_exceeded": ProviderIssue(
        "rate_limit_exceeded",
        "The AI service is receiving too many requests. Please wait a moment, then retry.",
        True,
    ),
    "authentication_failed": ProviderIssue(
        "authentication_failed",
        "The AI service's OpenAI connection needs attention. " + CONTACT,
        False,
    ),
    "model_unavailable": ProviderIssue(
        "model_unavailable",
        "The AI service cannot access the selected OpenAI model or resource. " + CONTACT,
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
