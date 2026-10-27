"""Deterministic credential redaction. Heuristics are not a complete secret scanner."""
import os
import re
import unicodedata
from urllib.parse import urlsplit, parse_qsl


def environment_secrets(context=None):
    values = [value for key, value in os.environ.items() if not key.startswith("NEXT_PUBLIC_")
              and re.search(r"SECRET|TOKEN|PASSWORD|API_KEY|DATABASE_URL", key)]
    provider = getattr(context, "ai_provider", None)
    values.extend([getattr(provider, "api_key", ""), getattr(provider, "openai_key", "")])
    return values


def redact_sensitive_text(value, known_secrets=()):
    text = re.sub(r"[\u200b-\u200d\ufeff]", "", unicodedata.normalize("NFKC", str(value or "")))
    for secret in sorted({v for v in known_secrets if isinstance(v, str) and len(v) >= 8}, key=len, reverse=True):
        text = text.replace(secret, "[redacted]")
    text = re.sub(r"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)", "[private key redacted]", text)
    text = re.sub(r"\b(?:Authorization|Proxy-Authorization|Cookie|Set-Cookie)\s*:[^\r\n]+", "[authentication header redacted]", text, flags=re.I)
    text = re.sub(r"\b(?:Bearer|Basic)\s+[A-Za-z0-9+/_=.-]{8,}", "[authorization redacted]", text, flags=re.I)
    text = re.sub(r'\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis)://[^\s<>"`]+', "[connection string redacted]", text, flags=re.I)
    text = re.sub(r'\b[A-Z][A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY|DATABASE_URL)[A-Z0-9_]*\b["\x27`* _]*\s*[:=][ \t]*(?:\r?\n[ \t]*)?[^\r\n]+', "[credential value redacted]", text)

    def safe_url(match):
        value = match.group()
        try:
            url = urlsplit(value)
            if url.username or url.password or any(re.search(r"token|secret|password|api.?key|signature|credential|authorization|x-amz-", key, re.I)
                                                    for key, _ in parse_qsl(url.query)):
                return "[credential URL redacted]"
        except ValueError:
            return "[invalid URL omitted]"
        return value

    text = re.sub(r'https?://[^\s<>"`)]+', safe_url, text, flags=re.I)
    text = re.sub(r"\b(?:sk-(?:proj-|or-v1-)?[A-Za-z0-9_-]{12,}|hsoat_[A-Za-z0-9_-]{12,}|(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{12,}|xox[baprs]-[A-Za-z0-9-]{12,}|AKIA[A-Z0-9]{16})\b", "[token redacted]", text)
    text = re.sub(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b", "[token redacted]", text)
    text = re.sub(r'\b(?:user[ _-]?name|login|password|passwd|passcode|pwd|api[ _-]?(?:key|token)|access[ _-]?token|refresh[ _-]?token|token|client[ _-]?secret|secret|credentials?)\b["\x27`* _]*\s*(?::|=|\bis\b|\bare\b)[ \t]*(?:\r?\n[ \t]*)?[^\r\n]+', "[credential value redacted]", text, flags=re.I)
    text = re.sub(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", "[email redacted]", text, flags=re.I)
    return re.sub(r"(?<![A-Za-z0-9_/-])(?=[A-Za-z0-9_-]{32,}(?![A-Za-z0-9_/-]))(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{32,}(?![A-Za-z0-9_/-])", "[token redacted]", text)


def sanitize_assistant_item(item, context=None):
    if getattr(item, "type", None) == "workflow" and item.workflow.type == "reasoning":
        return item.model_copy(update={"workflow": item.workflow.model_copy(update={"tasks": []})})
    if getattr(item, "type", None) != "assistant_message":
        return item
    from chatkit.types import AssistantMessageContent
    # Inspect the whole message, including values split across content parts.
    text = redact_sensitive_text("\n".join(part.text for part in item.content), environment_secrets(context))
    # Provider annotations may contain credential-bearing URLs; plain text keeps safe task links.
    return item.model_copy(update={"content": [AssistantMessageContent(text=text)]})
