# Walkthrough: Authorization, E2E, observability, and modularization closeout — 2026-07-28

## What changed

The authorization lifecycle now has one server-authoritative version that is checked by sessions and mutations, with RTDB access pre-revoked and reconciled durably. The E2E runner proves the actual RTDB Rules namespace, not a separate open database. Metrics are bounded and the local session validation measurement is repeatable.

The performance phase deliberately changes no business or configuration code: the current evidence is a healthy local baseline, while the prior Firebase performance closeout requires production evidence before reopening.

POS checkout and repair intake now delegate pure parsing/validation policy to small modules. The Firestore transaction bodies still own all reads-before-writes and business side effects.

## What a future AI must verify first

1. Treat the local 48ms p95 numbers as an Emulator baseline only.
2. Keep Firestore authority, RTDB tombstone, reconciliation job, and session version in one lifecycle contract.
3. In checkout/repair routes, do not move Firestore reads after writes or split atomic stock/debt/cashier/revenue/idempotency behavior.
4. Start with the focused module tests, then typecheck and the relevant Emulator suite.

## Operational boundary

This closeout is code complete but not a deployment assertion. A new phase must bring concrete production performance data or a reproducible security/authorization defect.

## Verified coverage boundary

There is no standalone `inventoryFifo.test.ts` or `commissionCalcServer.test.ts`. Current confidence for those paths comes from route/invariant behavior and Emulator coverage; add focused unit tests before claiming direct helper-level coverage.
