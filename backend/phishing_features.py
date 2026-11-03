
import math
import re
from collections import Counter
from urllib.parse import urlparse, parse_qs
from ipaddress import ip_address


SUSPICIOUS_WORDS = {
    "login", "verify", "account", "update", "secure",
    "signin", "banking", "password", "confirm", "wallet",
    "suspend", "authenticate", "recover", "webscr",
}


def extract_url_features(url: str) -> dict:
    """Extract the ten numeric features expected by the phishing model."""

    url = url.strip()
    parsed = urlparse(url if "://" in url else f"//{url}")

    hostname = parsed.hostname or ""
    path = parsed.path or ""

    try:
        ip_address(hostname)
        has_ip = 1
    except ValueError:
        has_ip = 0

    text = url.lower()
    entropy = 0.0

    if url:
        counts = Counter(url)
        length = len(url)
        entropy = -sum(
            (count / length) * math.log2(count / length)
            for count in counts.values()
        )

    suspicious_count = sum(
        text.count(word) for word in SUSPICIOUS_WORDS
    )

    return {
        "url_length": len(url),
        "num_dots": url.count("."),
        "has_https": int(parsed.scheme.lower() == "https"),
        "has_ip": has_ip,
        "num_subdirs": len([p for p in path.split("/") if p]),
        "num_params": len(parse_qs(parsed.query)),
        "suspicious_words": suspicious_count,
        "special_char_count": sum(not c.isalnum() for c in url),
        "digits_count": sum(c.isdigit() for c in url),
        "entropy": entropy,
    }
