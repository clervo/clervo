#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { performance } from "node:perf_hooks";

const studioHome = process.env.CODEX_HOME ? path.join(process.env.CODEX_HOME, "studio") : "/workspace/codex-home/studio";
const outputDir = path.resolve("docs/evidence/codex-studio/raw/mcp");
await mkdir(outputDir, { recursive: true });
const require = createRequire(path.join(studioHome, "package.json"));
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");
const { StreamableHTTPClientTransport } = require("@modelcontextprotocol/sdk/client/streamableHttp.js");

async function probe(name, command, args) {
  const started = performance.now();
  const transport = new StdioClientTransport({
    command,
    args,
    stderr: "pipe",
    env: { CI: "1", CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS: "1", CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: "1" },
  });
  let stderr = "";
  transport.stderr?.setEncoding("utf8");
  transport.stderr?.on("data", (chunk) => { stderr += chunk; });
  const client = new Client({ name: "clervo-studio-probe", version: "1.0.0" }, { capabilities: {} });
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    const durationMs = Number((performance.now() - started).toFixed(3));
    const raw = { name, command, args, durationMs, listed, stderr };
    await writeFile(path.join(outputDir, `${name}.json`), `${JSON.stringify(raw, null, 2)}\n`);
    return {
      name,
      durationMs,
      toolCount: listed.tools.length,
      toolSchemaBytes: Buffer.byteLength(JSON.stringify(listed.tools)),
      tools: listed.tools.map((tool) => tool.name),
    };
  } catch (error) {
    throw new Error(`${name} probe failed: ${error.message}; stderr=${stderr}`);
  } finally {
    await client.close();
  }
}

async function probeHttp(name, url) {
  const started = performance.now();
  const transport = new StreamableHTTPClientTransport(new URL(url));
  const client = new Client({ name: "clervo-studio-probe", version: "1.0.0" }, { capabilities: {} });
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    const durationMs = Number((performance.now() - started).toFixed(3));
    const raw = { name, url, durationMs, listed };
    await writeFile(path.join(outputDir, `${name}.json`), `${JSON.stringify(raw, null, 2)}\n`);
    return {
      name,
      durationMs,
      toolCount: listed.tools.length,
      toolSchemaBytes: Buffer.byteLength(JSON.stringify(listed.tools)),
      tools: listed.tools.map((tool) => tool.name),
    };
  } finally {
    await client.close();
  }
}

const results = [];
results.push(await probeHttp("openai-developer-docs", "https://developers.openai.com/mcp"));
results.push(await probeHttp("context7", "https://mcp.context7.com/mcp"));
results.push(await probe("chrome-devtools", process.execPath, [path.join(studioHome, "node_modules/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js"), "--no-usage-statistics", "--no-performance-crux", "--redact-network-headers"]));

const failureStarted = performance.now();
const failure = await new Promise((resolve) => {
  const child = spawn(path.join(studioHome, "node_modules/.bin/intentionally-missing-mcp"), [], { stdio: "ignore" });
  child.once("error", (error) => resolve({ isolated: true, code: error.code, durationMs: Number((performance.now() - failureStarted).toFixed(3)) }));
});

const summary = { schemaVersion: "clervo.codex-studio.mcp-probe.v1", results, failureIsolation: failure };
await writeFile(path.join(outputDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
