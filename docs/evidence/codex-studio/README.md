# Codex studio qualification evidence

Classification: repository/devbox control-plane maintenance evidence. The HTML
fixture and screenshots are credential-free repository-only test material, not
deployed-product evidence, customer proof, or availability claims.

## Final results

- Five installed profiles loaded with their intended sandbox and approval
  policy; first complete sample was 1.028–1.152 seconds per profile and the
  final guard-expanded sample was 0.959–1.736 seconds. A separately preserved
  pass had a transient 12.895-second visual-QA prompt-render outlier.
- OpenAI Developer Docs discovered 5 tools in 638.435 ms (3,244 schema bytes),
  Context7 2 in 295.443 ms (4,934 bytes), and Chrome DevTools 29 in 353.536 ms
  (22,608 bytes). Missing-server failure was isolated.
- Browser isolation used distinct disposable containers, loopback-only DevTools,
  visual network `none`, no shared mounts, and successful teardown.
- Playwright passed Chromium, Firefox and WebKit at 1440x900 and 390x844: six
  stable screenshots, zero axe violations, zero layout shift, keyboard focus,
  three reduced-motion checks, forced colors, slow-response simulation and 4x
  CPU throttling. Lighthouse performance/accessibility were 1.00/1.00, CLS 0,
  and LCP 750.802 ms on the local fixture.
- Native `rg` median was 4.184 ms; TypeScript semantic reference lookup median
  was 64.422 ms and returned the same four locations.
- Deterministic summaries reduced Codex feature output 75.80% and repository
  file inventory 87.53%; full raw logs remain canonical.

## Preserved failures

The raw directory retains the initial health metadata failure, two visual-QA
failures and their canonical Lighthouse report, the initial navigation fixture
failure, two output-compression fixture failures, and the launcher strict-debug
failure. None is rewritten as success. Final reports are separately named.

Important raw evidence:

- `raw/health-check.json` and `raw/health-check-final.json`
- `raw/mcp/summary.json` plus complete tool schemas
- `raw/browser-isolation.json` and `raw/browser-launcher-probe.json`
- `raw/navigation-benchmark.json`
- `raw/output-compression/benchmark.json` plus full raw logs
- `raw/visual-qa/summary.json`, screenshots, and `lighthouse.json`

No sealed/frozen/once-only product corpus or verifier was read, changed, or
rerun for this qualification.

## Retention and cleanup

Commit final JSON, full MCP schemas, canonical command logs, Lighthouse output,
deterministic screenshots, and every failed/degraded attempt needed to explain
repairs. New maintenance qualification may replace only the explicitly mutable
final report names; it must add a separate attempt record before repairing a
failure. Never overwrite product freeze evidence.

Containers and browser profiles are disposable and removed after every run.
Task-created download/scaffold caches are deleted after reviewed content is
installed. The immutable Playwright image remains as the recoverable machine
cache; uninstall only by exact digest after confirming no unrelated consumer.
