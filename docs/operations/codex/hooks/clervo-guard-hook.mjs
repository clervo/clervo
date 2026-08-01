#!/usr/bin/env node

const MAX_INPUT_BYTES = 1024 * 1024;

function deny(reason) {
  process.stdout.write(`${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  })}\n`);
}

function commandReason(command) {
  const value = command.toLowerCase();
  const checks = [
    [/\bx402-platform\b/u, "Legacy and unrelated environments are read-only and outside this studio."],
    [/(^|[\s/])\.env(?!\.example\b)/u, "Secret-bearing environment files must not be read or modified."],
    [/(^|[\s/])(auth\.json|\.ssh|\.gnupg)([\s/]|$)/u, "Authentication and private-key stores are outside autonomous tool access."],
    [/\b(printenv|env)\b/u, "Environment-value enumeration is blocked; use the redacted inventory."],
    [/\b(rm\s+-[^\n]*r[^\n]*f|git\s+(reset|clean|restore|checkout\s+--)|git\s+push[^\n]*--force)\b/u, "Destructive filesystem or Git operations require explicit approval and exact target verification."],
    [/\b(sudo|su\s+-|chmod\s+777|chown\s+-r)\b/u, "Privilege or broad ownership changes are outside the studio boundary."],
    [/\b(docker\s+system\s+prune|docker\s+volume\s+rm|docker\s+network\s+rm)\b/u, "Global Docker deletion could affect unrelated workloads."],
    [/\b(gcloud[^\n]*(billing|iam|secrets)|gcloud[^\n]*(deploy|services\s+(enable|disable)|projects\s+(create|delete)))\b/u, "Cloud billing, IAM, secret, API, project, or deployment mutation requires approval when it creates cost or irreversible production effects."],
    [/\b(kubectl\s+(apply|delete|replace|patch)|helm\s+(install|upgrade|uninstall)|terraform\s+(apply|destroy)|tofu\s+(apply|destroy))\b/u, "Cluster or infrastructure mutation requires approval when it creates cost or irreversible production effects."],
    [/\b(cast\s+send|solana\s+transfer|wallet\s+(send|transfer)|usdc\s+(send|transfer|approve))\b/u, "Wallet, payment, and USDC actions require explicit owner approval."],
    [/\b(curl|wget)\b[^\n]*(authorization:|x-api-key|private[_-]?key|bearer\s+\$)/u, "Commands must not transmit credential material."],
  ];

  for (const [pattern, reason] of checks) {
    if (pattern.test(value)) return reason;
  }

  const mutating = /\b(delete|deploy|apply|destroy|transfer|settle|pay|push|publish)\b/u.test(value);
  if (mutating && /\b(prod|production|billing|iam|wallet|payment|mainnet)\b/u.test(value)) {
    return "Production, billing, IAM, wallet, and payment mutations require the applicable explicit owner approval.";
  }
  return null;
}

function patchReason(command) {
  const fileLines = command.match(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gmu) ?? [];
  for (const line of fileLines) {
    const path = line.replace(/^\*\*\* (?:Add|Update|Delete) File: /u, "");
    if (path.includes("..")) return "Patches may not escape the Clervo repository.";
    if (path.startsWith("/") && !path.startsWith("/workspace/clervo-next/")) {
      return "Patches may modify only the Clervo clean-room repository.";
    }
    if (/(^|\/)\.env(?!\.example$)/u.test(path)) return "Secret-bearing environment files are protected.";
  }
  return commandReason(command);
}

function mcpReason(toolName, toolInput) {
  const name = toolName.toLowerCase();
  if (/figma/u.test(name) && /(create|delete|update|write|upload|send|add_)/u.test(name)) {
    return "Figma write tools remain disabled until explicit OAuth and file authority.";
  }
  if (/(github|gitlab|cloud|stripe|wallet|payment)/u.test(name) && /(create|delete|update|merge|push|send|pay|write)/u.test(name)) {
    return "External write-capable MCP tools require explicit approval when they affect third parties, production, money, or irreversible state.";
  }
  if (/chrome_devtools/u.test(name)) {
    const serialized = JSON.stringify(toolInput).toLowerCase();
    const urls = serialized.match(/https?:\\?\/\\?\/[a-z0-9._:%/?#=&+-]+/gu) ?? [];
    if (urls.some((url) => !/^https?:\\?\/\\?\/(127\.0\.0\.1|localhost|host\.docker\.internal)([:/]|$)/u.test(url))) {
      return "Browser-debug navigation is limited to local, credential-free targets.";
    }
  }
  return null;
}

let raw = "";
for await (const chunk of process.stdin) {
  raw += chunk;
  if (Buffer.byteLength(raw) > MAX_INPUT_BYTES) {
    deny("Guard input exceeded the fail-closed size limit.");
    process.exit(0);
  }
}

let input;
try {
  input = JSON.parse(raw);
} catch {
  deny("Guard received invalid hook JSON and failed closed.");
  process.exit(0);
}

const toolName = String(input.tool_name ?? "");
const toolInput = input.tool_input ?? {};
let reason = null;
if (toolName === "Bash") reason = commandReason(String(toolInput.command ?? ""));
else if (toolName === "apply_patch") reason = patchReason(String(toolInput.command ?? ""));
else if (toolName.startsWith("mcp__")) reason = mcpReason(toolName, toolInput);

if (reason) deny(reason);
