---
name: clervo-design-studio
description: Prepare, review, or implement authorized Clervo Web design with the canonical brand language, truthful product-evidence boundaries, design tokens, responsive behavior, accessibility, reduced motion, visual QA, and performance budgets. Use for Clervo UI, website, design-system, Figma, cinematic layout, motion, screenshot, frontend audit, or visual-release tasks; never treats studio readiness as product authority.
---

# Clervo Design Studio

## Establish design authority

1. Invoke `$clervo-engineering-stage`. Stop before product edits unless the exact active ticket authorizes them.
2. Read the canonical launch authority and existing product contracts, lifecycle states, evidence, components, tokens, and screenshots.
3. Separate machine-level preparation from repository implementation. Never add a frontend dependency, page, claim, or callable state merely because the studio can produce it.

## Apply the Clervo language

Use a near-black cinematic canvas, precise white typography, red for incoming request/risk/failure/unresolved state, green only for selected/verified/completed state, yellow for degraded/stale/uncertain/warning state, and the prism-and-beam system for request, qualification, result, and receipt. Prefer deliberate hierarchy, spacing, typography, and composition over generic dashboard grids or ornamental effects.

Encode color, type, spacing, radii, elevation, duration, easing, and viewport decisions as tokens or CSS variables when implementation is authorized. Choose one animation system for the ticket. Every animation must have a reduced-motion equivalent and stable before/after layout.

## Preserve truthful evidence

Keep generated atmosphere visibly distinct from real sources, results, quotes, status, receipts, terminal output, screenshots, and demonstrations. Label preview, unavailable, degraded, and planned behavior exactly. Do not invent customers, metrics, transactions, results, dashboards, or screenshots.

## Prove the experience

Test desktop and mobile viewports, keyboard-only navigation, focus order and visibility, semantic structure, axe findings, contrast, zoom/reflow, reduced motion, dark/light/high-contrast states when applicable, slow network, CPU throttling, layout shift, animation stability, and performance budgets. Preserve deterministic screenshots and raw reports with environment, browser, viewport, commit, and lifecycle truth.

Use Figma only after explicit OAuth and file authority. Use Storybook MCP only when the authorized repository already contains a real compatible Storybook project. Prefer deterministic Playwright/CLI checks to broad browser MCP schemas for routine visual QA.
