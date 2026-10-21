"""Curated client messages for provider failures, including HTTP 200 streams."""
from dataclasses import dataclass
import re

from openai import APIConnectionError, APIError, APITimeoutError


@dataclass(frozen=True)
class ProviderIssue:
    code: str
    message: str
    allow_retry: bool


class ImageGenerationError(Exception):
    """Only curated messages and validated response metadata may cross ChatKit."""
    def __init__(self, issue):
        self.issue = issue
        super().__init__(issue.code)


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
    # Agents wraps tool failures in UserError. Recover only our safe image
    # failure, never a wrapper's text or an arbitrary nested provider message.
    cause = error
    for _ in range(5):
        if isinstance(cause, ImageGenerationError):
            return cause.issue
        cause = cause.__cause__ if isinstance(cause, Exception) else None
        if cause is None:
            break
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


IMAGE_ISSUES = {
    "image_tool_disabled": ("Image generation is not enabled for this client. Ask an AOC administrator to enable and publish it in Assistant settings.", False),
    "image_provider_unconfigured": ("Image generation requires an OpenAI API key saved in AI provider settings.", False),
    "image_generation_limit_reached": ("This client's monthly image-generation allowance has been reached.", False),
    "image_reply_limit_reached": ("At most two files can be generated in one reply. Send a new message for another image.", False),
    "image_invalid_request": ("The image request was invalid. Revise the image description and try again.", False),
    "image_response_invalid": ("OpenAI did not return usable image data. No image download was created. Please retry.", True),
    "image_generation_failed": ("Image generation could not finish. No successful image download is available. " + CONTACT, True),
    "image_generation_timeout": ("The OpenAI image request timed out before an image was received. Please retry.", True),
    "image_connection_failed": ("The server could not connect to OpenAI to generate the image. Please retry.", True),
    "image_server_error": ("OpenAI returned a server error while generating the image. Please retry shortly.", True),
    "moderation_blocked": ("OpenAI blocked the image request under its safety policy. Revise the prompt and try again.", False),
    "credit_balance_exhausted": ("OpenAI could not generate the image because API credits are exhausted. " + CONTACT, False),
    "insufficient_quota": ("OpenAI could not generate the image because an API quota or billing limit was reached. " + CONTACT, False),
    "authentication_failed": ("OpenAI rejected the image-generation credentials. " + CONTACT, False),
    "model_unavailable": ("OpenAI could not access the configured image model or resource. " + CONTACT, False),
    "rate_limit_exceeded": ("OpenAI temporarily rate-limited image generation. Please wait a moment, then retry.", True),
}


def image_generation_error(code, error=None):
    """Keep actual HTTP/request identifiers, but never forward provider bodies."""
    if code not in IMAGE_ISSUES:
        code = "image_generation_failed"
    message, retry = IMAGE_ISSUES[code]
    details = ["Code: " + code]
    if isinstance(error, APIError):
        status = getattr(error, "status_code", None)
        if type(status) is int and 100 <= status <= 599:
            details.append("HTTP " + str(status))
        request_id = getattr(error, "request_id", None)
        if isinstance(request_id, str) and re.fullmatch(r"req_[A-Za-z0-9_-]{1,120}", request_id):
            details.append("OpenAI request: " + request_id)
    return ImageGenerationError(ProviderIssue(code, message + " (" + "; ".join(details) + ")", retry))


def image_provider_error(error):
    """Classify the real SDK failure; a 429 alone is never called billing."""
    if isinstance(error, APITimeoutError):
        code = "image_generation_timeout"
    elif isinstance(error, APIConnectionError):
        code = "image_connection_failed"
    elif isinstance(error, APIError):
        body = error.body if isinstance(error.body, dict) else {}
        if error.code == "moderation_blocked":
            code = "moderation_blocked"
        elif body.get("type") == "image_generation_user_error":
            code = "image_invalid_request"
        elif provider_issue(error).code != "request_failed":
            code = provider_issue(error).code
        elif getattr(error, "status_code", None) == 400:
            code = "image_invalid_request"
        elif (getattr(error, "status_code", None) or 0) >= 500:
            code = "image_server_error"
        else:
            code = "image_generation_failed"
    else:
        code = "image_generation_failed"
    return image_generation_error(code, error)
