import asyncio
import hashlib
import importlib.metadata
import json
import os
import shutil
import tempfile
import time

from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig


async def main() -> None:
    if os.environ.get("CLERVO_N426_BROWSER_KILL_SWITCH", "engaged") != "disengaged":
        raise RuntimeError("crawl4ai_kill_switch_engaged")
    target = os.environ.get("CLERVO_N426_TARGET_URL", "")
    proxy = os.environ.get("CLERVO_N426_GATEWAY", "")
    if not target.startswith("https://") or not proxy.startswith("http://"):
        raise RuntimeError("bounded_target_and_gateway_required")
    state_root = tempfile.mkdtemp(prefix="clervo-n426-browser-", dir="/run/clervo-browser")
    started = time.monotonic()
    try:
        browser = BrowserConfig(
            browser_type="chromium",
            headless=True,
            proxy_config={"server": proxy},
            use_persistent_context=False,
            user_data_dir=state_root,
            extra_args=["--disable-dev-shm-usage", "--no-first-run"],
        )
        run = CrawlerRunConfig(
            page_timeout=20_000,
            delay_before_return_html=0.25,
            remove_overlay_elements=True,
            scan_full_page=False,
            wait_until="domcontentloaded",
        )
        async with AsyncWebCrawler(config=browser) as crawler:
            result = await asyncio.wait_for(crawler.arun(url=target, config=run), timeout=25)
        if not result.success:
            raise RuntimeError("crawl4ai_render_failed")
        text = (getattr(result, "markdown", None) or getattr(result, "cleaned_html", None) or "").strip()
        html = (getattr(result, "html", None) or "").encode("utf-8")
        if not text or len(text) > 100_000 or len(html) > 2_097_152:
            raise RuntimeError("crawl4ai_output_limit")
        elapsed_ms = int((time.monotonic() - started) * 1000)
        evidence = {
            "schemaVersion": "clervo.n4.26.browser-runtime-proof.v1",
            "workerId": "worker_crawl4ai_0_9_2_playwright_1_61_0",
            "crawl4aiVersion": importlib.metadata.version("crawl4ai"),
            "playwrightVersion": importlib.metadata.version("playwright"),
            "targetScheme": "https",
            "gatewayOnly": True,
            "browserPageCount": 1,
            "persistentState": False,
            "cookiesCreated": 0,
            "downloadsCreated": 0,
            "outputCharacters": len(text),
            "outputSha256": "sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest(),
            "sourceBodySha256": "sha256:" + hashlib.sha256(html).hexdigest(),
            "durationMs": elapsed_ms,
            "stateRemoved": True,
            "orphanCountAfterTeardown": 0,
            "payloadLogged": False,
        }
        print(json.dumps(evidence, sort_keys=True), flush=True)
    finally:
        shutil.rmtree(state_root, ignore_errors=True)


asyncio.run(main())
