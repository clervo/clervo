#!/usr/bin/env python3
import hashlib
import json
import resource
import sys
import time

from scrapling.fetchers import FetcherSession


def main() -> None:
    if len(sys.argv) != 4:
        raise SystemExit("usage: scrapling-http.py URL EXPECTED_MARKER USER_AGENT")
    url, expected_marker, user_agent = sys.argv[1:]
    started = time.perf_counter()
    with FetcherSession(
        impersonate=None,
        stealthy_headers=False,
        proxies=None,
        proxy=None,
        timeout=5,
        headers={"User-Agent": user_agent, "Accept": "text/html,text/plain,application/xml,application/rss+xml"},
        retries=1,
        retry_delay=0,
        follow_redirects=False,
        max_redirects=0,
        verify=True,
    ) as session:
        response = session.get(url)
    body = response.body
    text = response.get_all_text(separator=" ", strip=True)
    usage = resource.getrusage(resource.RUSAGE_SELF)
    print(json.dumps({
        "tool": "scrapling_http",
        "version": "0.4.12",
        "status": response.status,
        "responseBytes": len(body),
        "bodySha256": hashlib.sha256(body).hexdigest(),
        "markerFound": expected_marker in text if expected_marker else True,
        "wallMs": round((time.perf_counter() - started) * 1000, 3),
        "maxRssKiB": usage.ru_maxrss,
        "configuration": {
            "impersonate": None,
            "stealthyHeaders": False,
            "proxy": None,
            "totalAttempts": 1,
            "retriesAfterFailure": 0,
            "followRedirects": False,
            "timeoutSeconds": 5,
        },
    }, sort_keys=True))


if __name__ == "__main__":
    main()
