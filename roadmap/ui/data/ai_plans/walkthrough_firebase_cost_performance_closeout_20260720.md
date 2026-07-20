# Walkthrough: Firebase cost and performance closeout - 2026-07-20

## What changed

The completed performance work moved the POS hot path away from sequential Firestore waits while retaining atomic business invariants. Admin data paths were made bounded or deferred where the data is not needed on initial render. The latest closeout added one shared API runtime wrapper so route telemetry, request correlation, safe unexpected-error responses, and timing metadata are consistent.

## What a future AI must verify first

1. Reproduce the slow route and read its phase timing before proposing a Firestore index or cache.
2. Keep sequential-ID reservation, stock, debt, cashier, revenue, and idempotency writes in their existing transaction boundary.
3. Confirm whether a product is explicitly legacy before skipping FIFO-lot reads.
4. For API changes, preserve expected 4xx domain errors while never returning raw unexpected 500 details.

## Verification record

- Lint: no errors; 25 existing warnings outside the staged scope.
- Typecheck: passed.
- Unit tests: 60 passed.
- AI guard: passed with the approved large-change override.
- Local smoke: settings, inventory, POS, and suppliers each returned HTTP 200.
- Git commit: <code>8838c10f3</code> on <code>codex/appearance-layout-studio-20260719</code>, pushed to GitHub.

## Operational boundary

This is a closeout, not a claim that latency can never change. The next action is production monitoring. A new implementation phase requires evidence that points to a specific slow timing phase or a renewed Firebase read/write pattern.
