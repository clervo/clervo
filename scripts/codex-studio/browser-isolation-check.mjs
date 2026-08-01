#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const image = "mcr.microsoft.com/playwright@sha256:dcc5531e97840b9b5e794f2814476b21571c5124a3fca2267d73041f56e7580e";
const debugName = "clervo-isolation-debug";
const visualName = "clervo-isolation-visual";
const outputPath = path.resolve("docs/evidence/codex-studio/raw/browser-isolation.json");

function docker(args, allowFailure = false) {
  const result = spawnSync("docker", args, { encoding: "utf8", timeout: 30_000, maxBuffer: 4 * 1024 * 1024 });
  if (!allowFailure && (result.error || result.status !== 0)) {
    throw new Error(`docker ${args.join(" ")} failed: ${result.error?.message ?? result.stderr}`);
  }
  return result;
}

function remove(name) {
  docker(["rm", "-f", name], true);
}

remove(debugName);
remove(visualName);
try {
  docker([
    "run", "--detach", "--rm", "--name", debugName,
    "--read-only", "--tmpfs", "/tmp:rw,noexec,nosuid,size=256m",
    "--publish", "127.0.0.1:9223:9222", image,
    "/ms-playwright/chromium-1234/chrome-linux64/chrome", "--headless=new", "--no-sandbox",
    "--remote-debugging-address=0.0.0.0", "--remote-debugging-port=9222",
    "--user-data-dir=/tmp/clervo-browser-debug", "about:blank",
  ]);
  docker([
    "run", "--detach", "--rm", "--name", visualName,
    "--network=none", "--read-only", "--tmpfs", "/tmp:rw,nosuid,size=256m", image,
    "node", "-e", "setInterval(() => {}, 1000)",
  ]);

  const [debugInspect] = JSON.parse(docker(["inspect", debugName]).stdout);
  const [visualInspect] = JSON.parse(docker(["inspect", visualName]).stdout);
  const browserProfile = await readFile("docs/operations/codex/profiles/browser-debug.config.toml", "utf8");
  const visualProfile = await readFile("docs/operations/codex/profiles/visual-qa.config.toml", "utf8");
  const visualRunner = await readFile("scripts/codex-studio/run-visual-qa.sh", "utf8");
  const checks = {
    distinctContainerIds: debugInspect.Id !== visualInspect.Id,
    debugLoopbackOnly: debugInspect.HostConfig.PortBindings?.["9222/tcp"]?.[0]?.HostIp === "127.0.0.1",
    debugDedicatedState: debugInspect.Config.Cmd.some((value) => value === "--user-data-dir=/tmp/clervo-browser-debug"),
    visualNetworkDisabled: visualInspect.HostConfig.NetworkMode === "none",
    noSharedMounts: debugInspect.Mounts.length === 0 && visualInspect.Mounts.length === 0,
    chromeMcpOnlyInDebugProfile: browserProfile.includes("[mcp_servers.chrome_devtools]") && !visualProfile.includes("mcp_servers.chrome_devtools"),
    visualRunnerCreatesFreshContainer: visualRunner.includes("docker run --rm") && visualRunner.includes("--network=none"),
  };
  const evidence = {
    schemaVersion: "clervo.codex-studio.browser-isolation.v1",
    passed: Object.values(checks).every(Boolean),
    checks,
    debug: { containerId: debugInspect.Id, networkMode: debugInspect.HostConfig.NetworkMode, portBindings: debugInspect.HostConfig.PortBindings, mounts: debugInspect.Mounts },
    visual: { containerId: visualInspect.Id, networkMode: visualInspect.HostConfig.NetworkMode, portBindings: visualInspect.HostConfig.PortBindings, mounts: visualInspect.Mounts },
    teardown: "Both disposable qualification containers are removed in finally.",
  };
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  if (!evidence.passed) process.exitCode = 1;
} finally {
  remove(visualName);
  remove(debugName);
}
