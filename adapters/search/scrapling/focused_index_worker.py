#!/usr/bin/env python3
"""Extraction-only Scrapling 0.4.12 worker. It has no fetch or browser surface."""

import base64
import importlib.metadata
import json
import re
import sys
from urllib.parse import urljoin

from scrapling import Selector

WORKER_ID = "worker_scrapling_0_4_12"
VERSION = "0.4.12"
MAXIMUM_INPUT_BYTES = 2 * 1024 * 1024
MAXIMUM_OUTPUT_CHARACTERS = 500_000


def normalize(value: str) -> str:
    return re.sub(r"\n{3,}", "\n\n", re.sub(r"[ \t\f\v]+", " ", value.replace("\r\n", "\n").replace("\r", "\n"))).strip()


def first(selector: Selector, expression: str) -> str:
    value = selector.css(expression).get()
    return value.strip() if isinstance(value, str) else ""


def main() -> None:
    if importlib.metadata.version("scrapling") != VERSION:
        raise RuntimeError("scrapling_worker_identity_substitution")
    request = json.load(sys.stdin)
    receipt = request.get("receipt", {})
    body = base64.b64decode(request.get("bodyBase64", ""), validate=True)
    if not body or len(body) > MAXIMUM_INPUT_BYTES:
        raise ValueError("invalid_scrapling_worker_input")
    url = receipt.get("finalUrl", "")
    mime = receipt.get("contentType", "")
    if mime not in ("text/html", "text/plain", "application/xhtml+xml"):
        raise ValueError("unsupported_scrapling_worker_mime")
    source = body.decode("utf-8", errors="strict")
    source = re.sub(r"<(script|style|noscript|svg|canvas|iframe|object|embed|template)\b[^>]*>[\s\S]*?(?:</\1\s*>|$)", "", source, flags=re.IGNORECASE)
    selector = Selector(source, url=url, adaptive=False, huge_tree=False)
    if mime == "text/plain":
        text = normalize(body.decode("utf-8", errors="strict"))
        title = text.split("\n", 1)[0][:512]
        canonical = ""
        language = "en"
        links = []
    else:
        text = normalize(selector.get_all_text(separator="\n", strip=True))
        title = normalize(first(selector, "title::text") or first(selector, "h1::text") or "Untitled source")[:512]
        canonical_value = first(selector, 'link[rel="canonical"]::attr(href)')
        canonical = urljoin(url, canonical_value) if canonical_value else ""
        language = (first(selector, "html::attr(lang)") or "en").lower().replace("_", "-")
        links = sorted({urljoin(url, link) for link in selector.css("a::attr(href), link::attr(href)").getall() if isinstance(link, str)})[:1000]
    if not text or len(text) > MAXIMUM_OUTPUT_CHARACTERS:
        raise ValueError("invalid_scrapling_worker_output")
    print(json.dumps({
        "workerId": WORKER_ID,
        "version": VERSION,
        "title": title,
        "text": text,
        "language": language,
        **({"canonicalUrl": canonical} if canonical else {}),
        "discoveredLinks": links,
        "configuration": {
            "networkAccess": False,
            "adaptive": False,
            "impersonation": False,
            "stealth": False,
            "proxy": False,
            "captcha": False,
        },
    }, sort_keys=True, separators=(",", ":")))


if __name__ == "__main__":
    main()
