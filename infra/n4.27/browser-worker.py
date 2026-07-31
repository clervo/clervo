import asyncio
import hashlib
import importlib.metadata
import json
import os
import signal
import shutil
import tempfile
import time
from pathlib import Path

from crawl4ai import AsyncWebCrawler, BrowserConfig, CacheMode, CrawlerRunConfig


def owned_processes() -> list[int]:
    own = os.getpid()
    result = []
    for entry in Path("/proc").iterdir():
        if entry.name.isdigit() and int(entry.name) != own:
            try:
                if entry.stat().st_uid == os.getuid():
                    result.append(int(entry.name))
            except (FileNotFoundError, PermissionError):
                pass
    return sorted(result)


def reap_children() -> None:
    while True:
        try:
            pid, _status = os.waitpid(-1, os.WNOHANG)
        except ChildProcessError:
            return
        if pid == 0:
            return


async def main() -> None:
    if os.environ.get("CLERVO_N427_BROWSER_KILL_SWITCH", "engaged") != "disengaged":
        raise RuntimeError("crawl4ai_kill_switch_engaged")
    target = os.environ.get("CLERVO_N427_TARGET_URL", "")
    gateway = os.environ.get("CLERVO_N427_GATEWAY", "")
    expected_marker = os.environ.get("CLERVO_N427_EXPECTED_MARKER", "")
    image_digest = os.environ.get("CLERVO_N427_IMAGE_DIGEST", "")
    if not target.startswith("https://") or not gateway.startswith("http://"):
        raise RuntimeError("bounded_target_and_gateway_required")
    if not expected_marker or not image_digest.startswith("sha256:"):
        raise RuntimeError("marker_and_digest_attestation_required")
    state_root = tempfile.mkdtemp(prefix="clervo-n427-browser-", dir="/run/clervo-browser")
    baseline_processes = owned_processes()
    started = time.monotonic()
    text = ""
    html = b""
    status = 0
    try:
        browser = BrowserConfig(
            browser_type="chromium",
            headless=True,
            use_managed_browser=False,
            proxy_config={"server": gateway},
            use_persistent_context=False,
            accept_downloads=False,
            downloads_path=None,
            storage_state=None,
            ignore_https_errors=False,
            java_script_enabled=True,
            user_agent="Clervo-N4.27-Browser/1.0 (mo@clervo.dev)",
            user_agent_mode="",
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
        run = CrawlerRunConfig(
            cache_mode=CacheMode.BYPASS,
            check_robots_txt=True,
            page_timeout=5_000,
            wait_until="domcontentloaded",
            wait_for=f"js:() => document.body.innerText.includes({json.dumps(expected_marker)})",
            wait_for_timeout=2_500,
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
        async with AsyncWebCrawler(config=browser, base_directory=state_root) as crawler:
            result = await asyncio.wait_for(crawler.arun(url=target, config=run), timeout=5.5)
        if not result.success:
            raise RuntimeError("crawl4ai_render_failed")
        text = (getattr(result, "markdown", None) or getattr(result, "cleaned_html", None) or "").strip()
        html = (getattr(result, "html", None) or "").encode("utf-8")
        status = int(getattr(result, "status_code", 0) or 0)
        if expected_marker not in text and expected_marker not in html.decode("utf-8", errors="replace"):
            raise RuntimeError("crawl4ai_expected_marker_missing")
        if not text or len(text) > 100_000 or len(html) > 2_097_152:
            raise RuntimeError("crawl4ai_output_limit")
    finally:
        shutil.rmtree(state_root, ignore_errors=True)
    await asyncio.sleep(0.25)
    state_removed = not Path(state_root).exists()
    orphan_processes = [pid for pid in owned_processes() if pid not in baseline_processes]
    reaped = len(orphan_processes)
    for pid in orphan_processes:
        try:
            os.kill(pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
    if orphan_processes:
        await asyncio.sleep(0.5)
    for pid in [pid for pid in owned_processes() if pid not in baseline_processes]:
        try:
            os.kill(pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    await asyncio.sleep(0.1)
    reap_children()
    orphan_processes = [pid for pid in owned_processes() if pid not in baseline_processes]
    if not state_removed or orphan_processes:
        raise RuntimeError("crawl4ai_teardown_failed")
    evidence = {
        "schemaVersion": "clervo.n4.27.browser-runtime-proof.v1",
        "workerId": "worker_crawl4ai_0_9_2_playwright_1_61_0_n427",
        "crawl4aiVersion": importlib.metadata.version("crawl4ai"),
        "playwrightVersion": importlib.metadata.version("playwright"),
        "imageDigest": image_digest,
        "targetScheme": "https",
        "gatewayOnly": True,
        "browserPageCount": 1,
        "persistentState": False,
        "cookiesOrLoginUsed": False,
        "downloadsAllowed": False,
        "arbitraryJavascriptAllowed": False,
        "hooksAllowed": False,
        "stealthAllowed": False,
        "proxyRotationAllowed": False,
        "status": status,
        "outputCharacters": len(text),
        "outputSha256": "sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest(),
        "sourceBodySha256": "sha256:" + hashlib.sha256(html).hexdigest(),
        "durationMs": round((time.monotonic() - started) * 1000, 3),
        "stateRemoved": state_removed,
        "orphanCountAfterTeardown": len(orphan_processes),
        "orphanReapedCount": reaped,
        "payloadLogged": False,
    }
    print(json.dumps(evidence, sort_keys=True), flush=True)


asyncio.run(main())
