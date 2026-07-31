#!/usr/bin/env python3
import asyncio
import hashlib
import json
import resource
import shutil
import sys
import tempfile
import time

from crawl4ai import AsyncWebCrawler, BrowserConfig, CacheMode, CrawlerRunConfig


async def run(url: str, expected_marker: str, user_agent: str) -> dict:
    state_directory = tempfile.mkdtemp(prefix="clervo-n423a-crawl4ai-")
    started = time.perf_counter()
    try:
        browser = BrowserConfig(
            browser_type="chromium",
            headless=True,
            use_managed_browser=False,
            use_persistent_context=False,
            accept_downloads=False,
            downloads_path=None,
            storage_state=None,
            ignore_https_errors=False,
            java_script_enabled=True,
            user_agent=user_agent,
            user_agent_mode="",
            proxy_config=None,
            enable_stealth=False,
            verbose=False,
            extra_args=[
                "--disable-background-networking",
                "--disable-component-update",
                "--disable-default-apps",
                "--disable-dev-shm-usage",
                "--disable-extensions",
                "--disable-sync",
                "--metrics-recording-only",
                "--no-first-run",
            ],
        )
        request = CrawlerRunConfig(
            cache_mode=CacheMode.BYPASS,
            check_robots_txt=True,
            page_timeout=5000,
            wait_until="domcontentloaded",
            wait_for='css:#rendered[data-ready="true"]',
            wait_for_timeout=2500,
            delay_before_return_html=0,
            semaphore_count=1,
            js_code=None,
            js_code_before_wait=None,
            c4a_script=None,
            max_retries=0,
            simulate_user=False,
            override_navigator=False,
            magic=False,
            process_iframes=False,
            screenshot=False,
            pdf=False,
            capture_network_requests=False,
            capture_console_messages=False,
            verbose=False,
        )
        async with AsyncWebCrawler(config=browser, base_directory=state_directory) as crawler:
            result = await crawler.arun(url=url, config=request)
        html = (result.html or "").encode("utf-8")
        self_usage = resource.getrusage(resource.RUSAGE_SELF)
        child_usage = resource.getrusage(resource.RUSAGE_CHILDREN)
        return {
            "tool": "crawl4ai_javascript",
            "version": "0.9.2",
            "success": bool(result.success),
            "status": int(result.status_code or 0),
            "responseBytes": len(html),
            "bodySha256": hashlib.sha256(html).hexdigest(),
            "markerFound": expected_marker in html.decode("utf-8", errors="replace"),
            "wallMs": round((time.perf_counter() - started) * 1000, 3),
            "maxRssKiB": max(self_usage.ru_maxrss, child_usage.ru_maxrss),
            "configuration": {
                "stealth": False,
                "proxy": None,
                "persistentContext": False,
                "downloads": False,
                "userJavaScript": False,
                "llmIntegration": False,
                "pageTimeoutMs": 5000,
                "robotsCheck": True,
            },
            "stateDestroyed": True,
        }
    finally:
        shutil.rmtree(state_directory, ignore_errors=True)


def main() -> None:
    if len(sys.argv) != 4:
        raise SystemExit("usage: crawl4ai-js.py URL EXPECTED_MARKER USER_AGENT")
    print(json.dumps(asyncio.run(run(*sys.argv[1:])), sort_keys=True))


if __name__ == "__main__":
    main()
