"""Only the authenticated Next.js proxy may assert client/user identity."""
import hashlib
import hmac
import time


def verify_signature(body: bytes, timestamp: str, signature: str, secret: str,
                     *, now: float | None = None) -> bool:
    if len(secret) < 32 or not timestamp.isascii() or not timestamp.isdecimal():
        return False
    if len(timestamp) > 12 or len(signature) != 64 or any(c not in "0123456789abcdef" for c in signature):
        return False
    if abs((time.time() if now is None else now) - int(timestamp)) > 60:
        return False
    expected = hmac.new(secret.encode(), timestamp.encode() + b"." + body,
                        hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)
