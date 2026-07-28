# Authorization, E2E, observability, and modularization closeout — 2026-07-28

## Status

- **Lifecycle:** CODE COMPLETE -> MONITORING
- **Scope:** authorization lifecycle, real Firebase Emulator proof, safe observability/SLO, evidence-led performance decision, and the first POS/Repair module boundary.
- **Not a production measurement claim:** all timing evidence below is from isolated local Emulator runs. Production p50/p95 and Firebase cost telemetry remain the only trigger for new performance work.

## Delivered contracts

### Authorization and RTDB revocation

- Signed admin/staff session cookies include a server-authoritative authorization version. Privileged mutations re-read the current Firestore user document and reject a stale cookie even if its signature is valid.
- Logout and role/permission changes advance the version. RTDB chat grants are pre-revoked with a versioned tombstone before the Firestore authority update; a durable reconciliation job covers projection retry.
- A copied cookie is therefore not accepted after logout or demotion, and an old RTDB role grant cannot remain usable while the Firestore change is being committed.

### Deterministic E2E proof

- The E2E runner allocates run-specific ports and artifacts and verifies that the child process, run ID, and result artifact all agree before accepting a pass.
- Browser/API tests use an authenticated session and the rules-backed default RTDB namespace `${projectId}-default-rtdb`; do not substitute a separate, open emulator database.
- The authorization lifecycle proves stale server-cookie denial, client RTDB read/write denial after demotion, and logout invalidation.

### Safe metrics and Phase 4 decision

- Observability allow-lists metric fields and bounds request IDs; raw exception text and arbitrary metadata are not emitted.
- Twenty samples after three warmups recorded local session-validation p95 values of **48.16ms**, **47.67ms**, and **48.03ms**, each with exactly one Firestore user-profile read.
- **Phase 4 decision:** no performance/config/auth code change is justified. The existing Firebase cost/performance closeout remains **CLOSED -> MONITORING**. The measurements are a local baseline, not a production SLO.

### POS/Repair module boundary

- `src/lib/posCheckoutRules.ts` owns pure POS input validation, synthetic line-ID normalization, cashier channel classification, repair paid/owed calculation, and product/category warranty resolution.
- `src/lib/repairCreateInput.ts` owns client timestamp parsing, payment-history validation, and removal of client-controlled repair fields.
- Firestore transaction ordering, stock/FIFO, debt, revenue, cashier tally, sequential IDs, and idempotency remain in their existing API routes. This refactor must not move reads after writes or weaken those invariants.

## Verification record

- Targeted module tests: 8 passed.
- Typecheck: passed.
- The preceding authorization/E2E pass recorded production build success, all Node tests, E2E, three isolated proof runs, and `git diff --check` success. Phase 6 repeats the full validation after the final documentation changes.

## Verified audit corrections and coverage boundary

- The E2E entrypoint is `scripts/e2e/run.ts`; a prior external audit incorrectly cited a nonexistent `scripts/e2e/runner.ts`.
- `CustomerDetailDrawer` uses bounded `limit(20)` realtime queries only for appointments and customer transactions. Orders and repairs load through `useCustomerActivity` with bounded `getDocs` queries (`limit(50)`); its realtime listener is limited to repair workflow configuration.
- POS checkout calls `requirePermission` before `db.runTransaction` and does not include `users/{uid}` in its core transaction reads.
- Repair and warranty statuses are dynamic `WorkflowNode[]` configuration from `system_config/repairs`, not a fixed six-status workflow.
- No direct `inventoryFifo.test.ts` or `commissionCalcServer.test.ts` exists. FIFO behavior must not be described as separately unit-tested unless a focused test is added; use route/invariant coverage and Emulator proof for the current state.

## Reopen rules

1. Open a performance work item only with production p50/p95, retry-rate, Firebase read/write cost, or a request-timing phase that identifies the bottleneck.
2. Investigate authorization only with a reproducible stale-session, stale RTDB grant, or reconciliation-job failure; retain fail-closed revocation behavior.
3. Continue POS/Repair decomposition in a separately tested slice. Keep each transaction route behaviorally identical and rollbackable; never combine refactoring with a business-rule change.

## Bootstrap for the next AI

1. Read this file, `roadmap/ai/modules/firebase_cost_performance_20260720.md`, and `.agents/coordination/codex-gemini-review.md`.
2. For POS checkout, read `src/lib/posCheckoutRules.ts` before `src/app/api/pos/checkout/route.ts`.
3. For repair intake, read `src/lib/repairCreateInput.ts` before `src/app/api/repairs/create/route.ts`.
4. Run the focused test first, then typecheck; run the Emulator proof when changing auth, rules, checkout, or repair transactions.
