"""Bot challenge and CAPTCHA detection (plan 6.2/2: no automatic fetch where the source asks for a human).

When a response is a challenge the fetcher stops the source until an operator resets it. Nothing here solves,
replays or works around a challenge. Markers come from the sites themselves: the Adalet Bakanlığı karar arama
sites (Yargıtay, Danıştay) answer with detailMessage DisplayCaptcha or reCaptchaTimeout once they want a human
(their search page script, 2026-11-15); common CDN challenge pages are covered by the HTML markers.
"""

from __future__ import annotations

from typing import Mapping, Optional

# Case sensitive markers that only appear in API error envelopes.
_API_MARKERS = ("DisplayCaptcha", "reCaptchaTimeout")
# Case insensitive markers for challenge pages; checked only on small HTML bodies so a decision that merely
# mentions a word is never mistaken for a challenge.
_PAGE_MARKERS = (
    "g-recaptcha",
    "h-captcha",
    "hcaptcha.com",
    "challenges.cloudflare.com",
    "cf-chl-",
    "cf-browser-verification",
    "just a moment...",
    "attention required",
    "/security-check",
    "ben robot değilim",
)
_MAX_PAGE_BYTES = 64 * 1024


def looks_like_challenge(status: int, headers: Mapping[str, str], body: bytes) -> Optional[str]:
    """Reason string when the response is a bot challenge, else None."""
    if headers.get("cf-mitigated", "").lower() == "challenge":
        return "cf-mitigated"
    head = body[:8192].decode("utf-8", errors="replace")
    for marker in _API_MARKERS:
        if marker in head:
            return marker
    ctype = headers.get("content-type", "").lower()
    if "html" in ctype and len(body) <= _MAX_PAGE_BYTES:
        low = body.decode("utf-8", errors="replace").lower()
        for marker in _PAGE_MARKERS:
            if marker in low:
                return marker
    return None
