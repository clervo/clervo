# B12 recovery — Docs search contract

## Purpose

Provide production-static, keyboard- and mobile-usable search across Clervo's
developer knowledge. Browser Find is not the implementation.

## Indexed content types

- Docs pages and titled sections
- Canonical operation reference and schema sections
- Models where identity or integration context is useful
- Errors, reason codes, and recovery/troubleshooting concepts
- Core concepts including catalog, lifecycle, proof level, wallet, quotes,
  spend limits, x402, receipts, replay, reconciliation, evidence, and provenance

The build generates a compact index from canonical prerender content and
structured operation/model metadata. Search never becomes product authority;
result state and snippets are derived from those sources.

## Result structure

Every result contains:

- title;
- content type;
- matched section heading;
- useful context/snippet;
- canonical destination including section anchor;
- current lifecycle indication only where supplied by canonical authority.

Results open the relevant page **and section**, not merely the document root.
Stable heading IDs are therefore part of the docs contract.

## Interaction

- A visible Docs search control and a documented `Cmd/Ctrl+K` shortcut open
  the search surface.
- Focus enters the query field; Arrow Up/Down moves the active result; Enter
  navigates; Escape closes and returns focus to the opener.
- Pointer and touch can select the query, result, close, and clear controls.
- The active result is announced without using color alone.
- Empty state explains the current query and offers clear/reset plus relevant
  index categories.
- Loading is normally unnecessary for a local static index; if a lazy chunk is
  used, loading and failure states are explicit and search remains dismissible.
- Back/forward and deep links preserve the destination article/section, not an
  opaque search-only state.

## Mobile

Search is available from the Docs header/navigation drawer without requiring
the desktop sidebar. The result surface fits 320px, owns scroll while open,
keeps the software keyboard from hiding the active result, and returns focus to
the mobile opener on close.

## Performance and accessibility

No external search vendor is introduced by default. The index is split or
compressed only when measured weight justifies it. Every result is a semantic
link; the dialog/combobox pattern must match the implemented behavior and pass
keyboard, screen-reader, touch, zoom/reflow, empty/error, and reduced-motion
checks.

## Rejection conditions

Reject if search is browser Find, returns only document roots, omits operations
and recovery concepts, traps focus, hides necessary results behind hover,
requires a desktop sidebar, or introduces a large vendor/runtime without a
measured need.
