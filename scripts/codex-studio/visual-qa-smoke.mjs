#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { spawn } from "node:child_process";

const moduleRoot = process.env.CLERVO_STUDIO_MODULE_ROOT;
if (!moduleRoot) throw new Error("CLERVO_STUDIO_MODULE_ROOT is required");
const require = createRequire(path.join(moduleRoot, "package.json"));
const { chromium, firefox, webkit } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;

const fixturePath = path.resolve("tools/codex-studio/fixtures/visual-qa.html");
const outputDir = path.resolve("docs/evidence/codex-studio/raw/visual-qa");
const fixture = await readFile(fixturePath);
const server = http.createServer((request, response) => {
  if (request.url === "/" || request.url === "/fixture") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    response.end(fixture);
    return;
  }
  response.writeHead(404).end("not found");
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (!address || typeof address === "string") throw new Error("fixture server did not bind");
const url = `http://127.0.0.1:${address.port}/fixture`;

const browsers = { chromium, firefox, webkit };
const viewports = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};
const results = [];
const started = performance.now();

try {
  for (const [browserName, browserType] of Object.entries(browsers)) {
    process.stdout.write(`starting ${browserName}\n`);
    const browser = await browserType.launch({ headless: true, timeout: 30_000 });
    try {
      for (const [viewportName, viewport] of Object.entries(viewports)) {
        const context = await browser.newContext({ viewport, colorScheme: "dark", reducedMotion: "no-preference" });
        const page = await context.newPage();
        await page.addInitScript(() => {
          globalThis.__clervoLayoutShifts = [];
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              if (!entry.hadRecentInput) globalThis.__clervoLayoutShifts.push(entry.value);
            }
          }).observe({ type: "layout-shift", buffered: true });
        });
        await page.route("**/fixture", async (route) => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          await route.continue();
        });
        await page.goto(url, { waitUntil: "networkidle", timeout: 15_000 });
        await page.keyboard.press("Tab");
        const focused = await page.evaluate(() => document.activeElement?.tagName ?? "");
        if (focused !== "A") throw new Error(`${browserName}/${viewportName}: keyboard focus failed`);
        const axe = await new AxeBuilder({ page }).analyze();
        if (axe.violations.length !== 0) throw new Error(`${browserName}/${viewportName}: axe violations=${axe.violations.length}`);
        const screenshotPath = path.join(outputDir, `${browserName}-${viewportName}.png`);
        const first = await page.screenshot({ path: screenshotPath, fullPage: true, animations: "disabled" });
        const second = await page.screenshot({ fullPage: true, animations: "disabled" });
        const firstHash = createHash("sha256").update(first).digest("hex");
        const secondHash = createHash("sha256").update(second).digest("hex");
        if (firstHash !== secondHash) throw new Error(`${browserName}/${viewportName}: screenshot instability`);
        const layoutShift = await page.evaluate(() => globalThis.__clervoLayoutShifts.reduce((sum, value) => sum + value, 0));
        if (layoutShift !== 0) throw new Error(`${browserName}/${viewportName}: layout shift=${layoutShift}`);
        results.push({ browser: browserName, viewport: viewportName, focused, axeViolations: 0, layoutShift, screenshotSha256: firstHash });
        await context.close();
      }

      const reduced = await browser.newContext({ viewport: viewports.desktop, reducedMotion: "reduce", colorScheme: "dark" });
      const reducedPage = await reduced.newPage();
      await reducedPage.goto(url, { timeout: 15_000 });
      const animationName = await reducedPage.locator(".beam").evaluate((element) => getComputedStyle(element).animationName);
      if (animationName !== "none") throw new Error(`${browserName}: reduced motion failed`);
      await reduced.close();
    } finally {
      await browser.close();
    }
  }

  const chromiumBrowser = await chromium.launch({ headless: true, timeout: 30_000 });
  const contrastContext = await chromiumBrowser.newContext({ forcedColors: "active", colorScheme: "light" });
  const contrastPage = await contrastContext.newPage();
  await contrastPage.goto(url, { timeout: 15_000 });
  const forcedColors = await contrastPage.evaluate(() => matchMedia("(forced-colors: active)").matches);
  if (!forcedColors) throw new Error("Chromium forced-colors emulation failed");
  const cdp = await contrastContext.newCDPSession(contrastPage);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  await contrastContext.close();
  await chromiumBrowser.close();

  const lighthousePath = path.join(moduleRoot, "node_modules/lighthouse/cli/index.js");
  const lighthouseOutput = path.join(outputDir, "lighthouse.json");
  const chromePath = "/ms-playwright/chromium-1234/chrome-linux64/chrome";
  const lighthouseExit = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      lighthousePath,
      url,
      "--quiet",
      "--output=json",
      `--output-path=${lighthouseOutput}`,
      "--only-categories=performance,accessibility",
      "--chrome-flags=--headless=new --no-sandbox --disable-dev-shm-usage --disable-background-networking",
    ], { env: { ...process.env, CHROME_PATH: chromePath }, stdio: ["ignore", "inherit", "inherit"] });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code));
  });
  if (lighthouseExit !== 0) throw new Error(`Lighthouse exited ${lighthouseExit}`);
  const lighthouse = JSON.parse(await readFile(lighthouseOutput, "utf8"));
  const lighthouseScores = {
    performance: lighthouse.categories.performance.score,
    accessibility: lighthouse.categories.accessibility.score,
    cumulativeLayoutShift: lighthouse.audits["cumulative-layout-shift"].numericValue,
    largestContentfulPaintMs: lighthouse.audits["largest-contentful-paint"].numericValue,
  };
  if (lighthouseScores.accessibility < 1) throw new Error(`Lighthouse accessibility=${lighthouseScores.accessibility}`);

  const summary = {
    schemaVersion: "clervo.codex-studio.visual-qa.v1",
    fixtureClassification: "credential_free_repository_only_not_product_evidence",
    image: "mcr.microsoft.com/playwright@sha256:dcc5531e97840b9b5e794f2814476b21571c5124a3fca2267d73041f56e7580e",
    packageVersion: "1.62.1",
    matrixChecks: results.length,
    reducedMotionChecks: 3,
    forcedColorsChecks: 1,
    slowNetworkDelayMs: 100,
    cpuThrottleRateTested: 4,
    lighthouseScores,
    durationMs: Number((performance.now() - started).toFixed(3)),
    results,
  };
  await writeFile(path.join(outputDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
} finally {
  await new Promise((resolve) => server.close(resolve));
}
