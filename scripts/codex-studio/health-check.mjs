#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";

const repoRoot = process.cwd();
const codexHome = process.env.CODEX_HOME ?? "/workspace/codex-home";
const studioHome = path.join(codexHome, "studio");
const outputPath = path.resolve(process.argv[2] ?? "docs/evidence/codex-studio/raw/health-check.json");
const profiles = ["engineering", "studio-maintenance", "design", "browser-debug", "visual-qa"];
const skills = ["clervo-cloud-cleanup", "clervo-x402-proof", "clervo-design-studio"];
const checks = [];

function run(name, command, args, options = {}) {
  const started = performance.now();
  const result = spawnSync(command, args, { cwd: repoRoot, encoding: "utf8", timeout: options.timeout ?? 30000, maxBuffer: 8 * 1024 * 1024 });
  const durationMs = Number((performance.now() - started).toFixed(3));
  return { name, command: [command, ...args].join(" "), durationMs, exitCode: result.status, signal: result.signal, stdout: result.stdout, stderr: result.stderr };
}

function record(name, passed, details = {}) {
  checks.push({ name, passed, ...details });
}

for (const profile of profiles) {
  const sourcePath = path.join(repoRoot, "docs/operations/codex/profiles", `${profile}.config.toml`);
  const installedPath = path.join(codexHome, `${profile}.config.toml`);
  const source = await readFile(sourcePath);
  const installed = await readFile(installedPath);
  record(`profile-copy:${profile}`, source.equals(installed), { sha256: createHash("sha256").update(source).digest("hex") });
  const profileText = source.toString("utf8");
  record(`profile-terminal:${profile}`, profileText.includes('[tui]\nalternate_screen = "never"\nraw_output_mode = false'), {
    alternateScreen: "never",
    rawOutputMode: false,
  });
  const parse = run(`profile-start:${profile}`, "codex", ["--profile", profile, "debug", "prompt-input", "Profile startup probe."]);
  const expectedMode = ["studio-maintenance", "browser-debug", "visual-qa"].includes(profile) ? "danger-full-access" : "workspace-write";
  const permissionLoaded = parse.stdout.includes(`\`sandbox_mode\` is \`${expectedMode}\``) && parse.stdout.includes("Approval policy is currently never");
  const debugReadOnlyOverride = parse.stdout.includes("`sandbox_mode` is `read-only`");
  record(`profile-start:${profile}`, parse.exitCode === 0 && (permissionLoaded || debugReadOnlyOverride), {
    durationMs: parse.durationMs,
    exitCode: parse.exitCode,
    permissionMode: expectedMode,
    permissionProbe: permissionLoaded ? "profile-rendered" : "debug-read-only-override",
    stderr: parse.stderr.trim(),
  });
}

const tmuxSourcePath = path.join(repoRoot, "docs/operations/codex/tmux.conf");
const tmuxInstalledPath = process.env.CLERVO_STUDIO_TMUX_CONFIG ?? path.join(homedir(), ".tmux.conf");
const tmuxSource = await readFile(tmuxSourcePath);
const tmuxInstalled = await readFile(tmuxInstalledPath);
record("tmux:copy", tmuxSource.equals(tmuxInstalled), {
  installedPath: tmuxInstalledPath,
  sha256: createHash("sha256").update(tmuxSource).digest("hex"),
});
const tmuxSocket = `clervo-codex-health-${process.pid}`;
const tmuxStart = run("tmux:start", "tmux", ["-L", tmuxSocket, "-f", tmuxInstalledPath, "new-session", "-d", "-s", "health"]);
const tmuxMouse = run("tmux:mouse", "tmux", ["-L", tmuxSocket, "show-options", "-g", "mouse"]);
const tmuxHistory = run("tmux:history", "tmux", ["-L", tmuxSocket, "show-options", "-g", "history-limit"]);
const tmuxBinding = run("tmux:selection-toggle-binding", "tmux", ["-L", tmuxSocket, "list-keys", "-T", "prefix", "y"]);
const tmuxToggleOff = run("tmux:toggle-off", "tmux", ["-L", tmuxSocket, "set-option", "-g", "mouse"]);
const tmuxMouseOff = run("tmux:mouse-off", "tmux", ["-L", tmuxSocket, "show-options", "-g", "mouse"]);
const tmuxToggleOn = run("tmux:toggle-on", "tmux", ["-L", tmuxSocket, "set-option", "-g", "mouse"]);
const tmuxMouseOn = run("tmux:mouse-on", "tmux", ["-L", tmuxSocket, "show-options", "-g", "mouse"]);
const tmuxStop = run("tmux:stop", "tmux", ["-L", tmuxSocket, "kill-server"]);
record("tmux:runtime", tmuxStart.exitCode === 0
  && tmuxMouse.stdout.trim() === "mouse on"
  && tmuxHistory.stdout.trim() === "history-limit 200000"
  && tmuxBinding.stdout.includes("set-option -g mouse")
  && tmuxToggleOff.exitCode === 0
  && tmuxMouseOff.stdout.trim() === "mouse off"
  && tmuxToggleOn.exitCode === 0
  && tmuxMouseOn.stdout.trim() === "mouse on"
  && tmuxStop.exitCode === 0, {
  mouse: tmuxMouse.stdout.trim(),
  historyLimit: tmuxHistory.stdout.trim(),
  nativeSelectionToggle: "prefix+y",
  toggleOffResult: tmuxMouseOff.stdout.trim(),
  toggleOnResult: tmuxMouseOn.stdout.trim(),
  startExitCode: tmuxStart.exitCode,
  stopExitCode: tmuxStop.exitCode,
});

for (const skill of skills) {
  const skillPath = path.join(repoRoot, ".agents/skills", skill, "SKILL.md");
  const metadataPath = path.join(repoRoot, ".agents/skills", skill, "agents/openai.yaml");
  const skillBody = await readFile(skillPath, "utf8");
  const metadata = await readFile(metadataPath, "utf8");
  record(`skill:${skill}`, skillBody.startsWith("---\n") && metadata.includes(`$${skill}`), {
    skillSha256: createHash("sha256").update(skillBody).digest("hex"),
    metadataSha256: createHash("sha256").update(metadata).digest("hex"),
  });
}

const packageExpectations = {
  "@playwright/test": "1.62.1",
  "@axe-core/playwright": "4.12.1",
  "@modelcontextprotocol/sdk": "1.30.0",
  "chrome-devtools-mcp": "1.6.0",
  lighthouse: "13.4.1",
  svgo: "4.0.2",
};
for (const [packageName, expected] of Object.entries(packageExpectations)) {
  const packageJson = JSON.parse(await readFile(path.join(studioHome, "node_modules", packageName, "package.json"), "utf8"));
  record(`package:${packageName}`, packageJson.version === expected, { expected, actual: packageJson.version, license: packageJson.license });
}

const studioPackage = JSON.parse(await readFile(path.join(repoRoot, "tools/codex-studio/package.json"), "utf8"));
const rejectedPackages = ["@playwright/mcp", "@upstash/context7-mcp", "serena", "rtk", "caveman", "shadcn", "storybook"];
record("packages:rejected-absent", rejectedPackages.every((name) => !studioPackage.dependencies?.[name]), { rejectedPackages });
const rootPackage = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"));
const deferredFrontendPackages = ["next", "react", "tailwindcss", "storybook", "motion", "gsap", "three", "@react-three/fiber", "lottie-web", "@rive-app/react-canvas"];
record("packages:frontend-deferred", deferredFrontendPackages.every((name) => !rootPackage.dependencies?.[name] && !rootPackage.devDependencies?.[name]), { deferredFrontendPackages });
const designProfile = await readFile(path.join(repoRoot, "docs/operations/codex/profiles/design.config.toml"), "utf8");
const visualProfile = await readFile(path.join(repoRoot, "docs/operations/codex/profiles/visual-qa.config.toml"), "utf8");
record("mcp:figma-disabled", designProfile.includes("[mcp_servers.figma]") && designProfile.includes("enabled = false"), {});
record("mcp:playwright-absent", !visualProfile.includes("mcp_servers") && !studioPackage.dependencies?.["@playwright/mcp"], {});

const hookPath = path.join(repoRoot, "docs/operations/codex/hooks/clervo-guard-hook.mjs");
const allowedHook = spawnSync("node", [hookPath], { input: JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "npm run typecheck" } }), encoding: "utf8" });
record("hook:allows-safe", allowedHook.status === 0 && allowedHook.stdout === "", { output: allowedHook.stdout.trim() });
const deniedHook = spawnSync("node", [hookPath], { input: JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "git reset --hard HEAD" } }), encoding: "utf8" });
record("hook:blocks-destructive-git", deniedHook.status === 0 && deniedHook.stdout.includes('"permissionDecision":"deny"'), { output: deniedHook.stdout.trim() });
const browserHook = spawnSync("node", [hookPath], { input: JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "mcp__chrome_devtools__navigate_page", tool_input: { url: "https://example.com" } }), encoding: "utf8" });
record("hook:blocks-external-browser", browserHook.status === 0 && browserHook.stdout.includes('"permissionDecision":"deny"'), { output: browserHook.stdout.trim() });
const deniedHookCases = [
  ["legacy-path", "Bash", { command: `ls /workspace/${"x402"}-${"platform"}` }],
  ["environment-enumeration", "Bash", { command: "printenv" }],
  ["cloud-iam", "Bash", { command: "gcloud projects add-iam-policy-binding example" }],
  ["wallet-payment", "Bash", { command: "cast send 0x0000000000000000000000000000000000000000" }],
  ["figma-write", "mcp__figma__create_file", { name: "unauthorized" }],
];
for (const [caseName, toolName, toolInput] of deniedHookCases) {
  const result = spawnSync("node", [hookPath], { input: JSON.stringify({ hook_event_name: "PreToolUse", tool_name: toolName, tool_input: toolInput }), encoding: "utf8" });
  record(`hook:blocks-${caseName}`, result.status === 0 && result.stdout.includes('"permissionDecision":"deny"'), { output: result.stdout.trim() });
}

const rulePath = path.join(repoRoot, "docs/operations/codex/rules/clervo-studio.rules");
const ruleCheck = run("rules:destructive-git", "codex", ["execpolicy", "check", "--rules", rulePath, "--", "git", "reset", "--hard", "HEAD"]);
record("rules:destructive-git", ruleCheck.exitCode === 0 && ruleCheck.stdout.includes("forbidden"), { durationMs: ruleCheck.durationMs, output: ruleCheck.stdout.trim() });
for (const [caseName, command] of [
  ["global-docker-delete", ["docker", "system", "prune"]],
  ["cluster-mutation", ["kubectl", "apply", "-f", "manifest.yaml"]],
  ["infrastructure-mutation", ["tofu", "destroy"]],
  ["wallet-payment", ["cast", "send", "0x0000000000000000000000000000000000000000"]],
]) {
  const result = run(`rules:${caseName}`, "codex", ["execpolicy", "check", "--rules", rulePath, "--", ...command]);
  record(`rules:${caseName}`, result.exitCode === 0 && result.stdout.includes("forbidden"), { durationMs: result.durationMs, output: result.stdout.trim() });
}

const image = run("docker-image", "docker", ["image", "inspect", "mcr.microsoft.com/playwright@sha256:dcc5531e97840b9b5e794f2814476b21571c5124a3fca2267d73041f56e7580e", "--format", "{{.Id}}"]);
record("docker-image:pinned-playwright", image.exitCode === 0 && image.stdout.includes("sha256:"), { imageId: image.stdout.trim(), durationMs: image.durationMs });

const toolVersions = [
  run("codex", "codex", ["--version"]),
  run("node", "node", ["--version"]),
  run("npm", "npm", ["--version"]),
  run("git", "git", ["--version"]),
  run("docker", "docker", ["--version"]),
  run("compose", "docker", ["compose", "version"]),
  run("jq", "jq", ["--version"]),
  run("shellcheck", "shellcheck", ["--version"]),
  run("tmux", "tmux", ["-V"]),
];
for (const tool of toolVersions) record(`tool:${tool.name}`, tool.exitCode === 0, { durationMs: tool.durationMs, version: tool.stdout.trim().split("\n").slice(0, 2).join(" | ") });

const credentialVariableNames = Object.keys(process.env).filter((name) => /(KEY|TOKEN|SECRET|PASSWORD|WALLET|CREDENTIAL)/iu.test(name)).sort();
const report = {
  schemaVersion: "clervo.codex-studio.health.v1",
  passed: checks.every((check) => check.passed),
  checks,
  profileStartupMs: Object.fromEntries(checks.filter((check) => check.name.startsWith("profile-start:")).map((check) => [check.name.slice("profile-start:".length), check.durationMs])),
  credentialVariableNamesOnly: credentialVariableNames,
  snapshotReadiness: {
    billableSnapshotCreated: false,
    reproducibleInstaller: "scripts/codex-studio/install.sh",
    pinnedBrowserImage: "sha256:dcc5531e97840b9b5e794f2814476b21571c5124a3fca2267d73041f56e7580e",
    machineLocalSecretsRecorded: false,
  },
};
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.passed) process.exitCode = 1;
