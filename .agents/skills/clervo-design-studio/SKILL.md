---
name: clervo-design-studio
description: Prepare, review, or implement Clervo Web design with the canonical brand language, truthful product-evidence boundaries, design tokens, responsive behavior, accessibility, reduced motion, visual QA, and performance budgets. Use for Clervo UI, website, design-system, Figma, cinematic layout, motion, screenshot, frontend audit, or visual-release tasks.
---

# Clervo Design Studio

## Establish design context

1. Read the current task, product contracts, generated lifecycle state,
   components, tokens, and current implementation.
2. Inspect the current implementation and preserve its truthful product state.
3. Separate machine-level preparation from repository implementation. Never add a frontend dependency, page, claim, or callable state merely because the studio can produce it.

## Apply the Clervo language

Use a near-black cinematic canvas, precise white typography, red for incoming request/risk/failure/unresolved state, green only for selected/verified/completed state, yellow for degraded/stale/uncertain/warning state, and the prism-and-beam system for request, qualification, result, and receipt. Prefer deliberate hierarchy, spacing, typography, and composition over generic dashboard grids or ornamental effects.

Encode color, type, spacing, radii, elevation, duration, easing, and viewport decisions as tokens or CSS variables. Choose one animation system for the surface. Every animation must have a reduced-motion equivalent and stable before/after layout.

## Preserve truthful evidence

Keep generated atmosphere visibly distinct from real sources, results, quotes,
status, receipts, terminal output, screenshots, and demonstrations. Expose
unavailable or degraded behavior accurately. Do not invent customers, metrics,
transactions, results, dashboards, or screenshots.

## Prove the experience

Test desktop and mobile viewports, keyboard-only navigation, focus order and
visibility, semantic structure, axe findings, contrast, zoom/reflow, reduced
motion, relevant display states, slow network, CPU throttling, layout shift,
animation stability, and performance budgets.

Use Figma only after explicit OAuth and file access. Use Storybook MCP only when the repository already contains a real compatible Storybook project. Prefer deterministic Playwright/CLI checks to broad browser MCP schemas for routine visual QA.
