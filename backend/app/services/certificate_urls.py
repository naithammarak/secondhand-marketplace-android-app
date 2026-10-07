"""Trusted public origin for certificate links; never derive it from Host."""

import os
from urllib.parse import urlsplit


def public_certificate_base_url() -> str:
    value = os.getenv("PUBLIC_CERTIFICATE_BASE_URL", "")
    try:
        parsed = urlsplit(value)
        valid = (
            value == value.strip()
            and parsed.scheme == "https"
            and bool(parsed.hostname)
            and parsed.username is None
            and parsed.password is None
            and parsed.path in {"", "/"}
            and "?" not in value
            and "#" not in value
            and "\\" not in value
            and not any(char.isspace() for char in value)
            and not parsed.netloc.endswith(":")
        )
        port = parsed.port  # Reject a malformed port even when hostname is present.
        valid = valid and (port is None or port > 0)
    except ValueError as exc:
        raise ValueError("PUBLIC_CERTIFICATE_BASE_URL must be an HTTPS origin") from exc
    if not valid:
        raise ValueError("PUBLIC_CERTIFICATE_BASE_URL must be an HTTPS origin")
    return f"https://{parsed.netloc}"
