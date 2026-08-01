#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { API } from "typescript/unstable/sync";

const symbolName = "retrievalCacheKey";
const repoRoot = process.cwd();
const definitionFile = path.join(repoRoot, "services/search/src/retrieval-cache.ts");
const outputPath = path.resolve("docs/evidence/codex-studio/raw/navigation-benchmark.json");

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function nativeRun() {
  const start = performance.now();
  const result = spawnSync("rg", ["-n", "--glob", "*.ts", `\\b${symbolName}\\b`, "packages", "services", "tests"], { cwd: repoRoot, encoding: "utf8" });
  return { durationMs: performance.now() - start, status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function semanticRun() {
  const start = performance.now();
  const api = new API({ cwd: repoRoot });
  try {
    const snapshot = api.updateSnapshot({ openProjects: [path.join(repoRoot, "tsconfig.json")] });
    const project = snapshot.getDefaultProjectForFile(definitionFile) ?? snapshot.getProjects()[0];
    if (!project) throw new Error("TypeScript project not found");
    const definitionText = readFileSync(definitionFile, "utf8");
    const definitionOffset = definitionText.indexOf(symbolName);
    const symbol = project.checker.getSymbolAtPosition(definitionFile, definitionOffset);
    if (!symbol) throw new Error(`${symbolName} did not resolve to a TypeScript symbol`);
    const matches = [];
    for (const fileName of project.program.getSourceFileNames()) {
      if (fileName.includes("/node_modules/")) continue;
      for (const handle of project.checker.getReferencesToSymbolInFile(fileName, symbol)) {
        const node = handle.resolve(project);
        if (!node) continue;
        const source = node.getSourceFile();
        const position = source.getLineAndCharacterOfPosition(node.getStart(source));
        matches.push({
          file: path.relative(repoRoot, source.fileName),
          line: position.line + 1,
          column: position.character + 1,
          symbol: symbol.name,
        });
      }
    }
    matches.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column);
    return { durationMs: performance.now() - start, matches };
  } finally {
    api.close();
  }
}

const nativeRuns = Array.from({ length: 5 }, nativeRun);
const semanticRuns = Array.from({ length: 3 }, semanticRun);
const nativeRaw = nativeRuns.at(-1);
const semanticRaw = semanticRuns.at(-1);
const evidence = {
  schemaVersion: "clervo.codex-studio.navigation-benchmark.v1",
  task: `locate definitions and references for ${symbolName}`,
  nativeRg: {
    medianDurationMs: Number(median(nativeRuns.map((run) => run.durationMs)).toFixed(3)),
    outputBytes: Buffer.byteLength(nativeRaw.stdout),
    status: nativeRaw.status,
    stdout: nativeRaw.stdout,
    stderr: nativeRaw.stderr,
  },
  typescriptSemantic: {
    medianDurationMs: Number(median(semanticRuns.map((run) => run.durationMs)).toFixed(3)),
    outputBytes: Buffer.byteLength(JSON.stringify(semanticRaw.matches)),
    matches: semanticRaw.matches,
  },
  decision: "retain native rg for default navigation; use the pinned TypeScript compiler API for exact semantic questions; do not retain Serena MCP for this repository size",
};
await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
