#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

const outputDir = path.resolve("docs/evidence/codex-studio/raw/output-compression");
await mkdir(outputDir, { recursive: true });
const cases = [
  { name: "codex-features", command: "codex", args: ["features", "list"] },
  { name: "repository-file-inventory", command: "rg", args: ["--files"] },
];
const results = [];

for (const item of cases) {
  const started = performance.now();
  const result = spawnSync(item.command, item.args, { cwd: process.cwd(), encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  const durationMs = Number((performance.now() - started).toFixed(3));
  const raw = `${result.stdout}${result.stderr}`;
  if (result.status !== 0 || raw.length === 0) throw new Error(`${item.name} did not produce successful canonical output`);
  const lines = raw.split(/\r?\n/u);
  const diagnostic = lines.filter((line) => /\b(error|fail|warn|missing|invalid|denied)\b/iu.test(line));
  const selected = [...lines.slice(0, 12), ...diagnostic, ...lines.slice(-12)].filter((line, index, values) => line && values.indexOf(line) === index);
  const summary = [
    `command=${item.command} ${item.args.join(" ")}`,
    `exit=${result.status}`,
    `lines=${lines.length}`,
    `bytes=${Buffer.byteLength(raw)}`,
    ...selected,
  ].join("\n") + "\n";
  await writeFile(path.join(outputDir, `${item.name}.raw.log`), raw);
  await writeFile(path.join(outputDir, `${item.name}.summary.log`), summary);
  results.push({
    name: item.name,
    durationMs,
    exitCode: result.status,
    rawBytes: Buffer.byteLength(raw),
    summaryBytes: Buffer.byteLength(summary),
    approximateRawTokens: Math.ceil(Buffer.byteLength(raw) / 4),
    approximateSummaryTokens: Math.ceil(Buffer.byteLength(summary) / 4),
    reductionRatio: Number((1 - Buffer.byteLength(summary) / Math.max(Buffer.byteLength(raw), 1)).toFixed(4)),
    rawEvidence: `${item.name}.raw.log`,
  });
}

const evidence = {
  schemaVersion: "clervo.codex-studio.output-compression.v1",
  method: "deterministic head-tail-diagnostic projection with full raw canonical output retained",
  results,
  decision: "retain explicit deterministic summaries for interactive use; reject RTK and Caveman as automatic evidence filters",
};
await writeFile(path.join(outputDir, "benchmark.json"), `${JSON.stringify(evidence, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
