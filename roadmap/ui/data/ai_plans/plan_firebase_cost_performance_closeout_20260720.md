# Firebase cost and performance closeout

- Date: 2026-07-20
- Status: completed; monitoring only
- Goal: capture the completed cost/performance work in a durable handoff and prevent future changes from trading correctness for short-lived latency gains.

## Delivered scope

1. POS checkout telemetry and Firestore hot-path scheduling, including legacy FIFO classification and idempotent cashier tally handling.
2. Inventory-import timing instrumentation and preservation of the idempotency, receipt-version, supplier, accounting, and readable-ID contracts during optimization.
3. Firebase read-cost reductions through bounded data loading, deferred admin requests, and index-source cleanup.
4. Central API execution wrapper with request correlation, Server-Timing, stable error handling, and a restricted POS payment configuration route.

## Non-goals

- Do not replace readable sequential IDs with server-local caches.
- Do not remove transaction guards, idempotency, FIFO correctness, or synchronous financial aggregates merely to lower a single latency sample.
- Do not claim a new production p95 before the normal deployment pipeline and a real measurement run.

## Acceptance evidence

- Measured DEBT POS sample improved from 7,646ms total / 4,608ms callback to 3,639ms total / 2,193ms callback.
- 62 changed API routes use the shared handler.
- The final code review passed lint with no errors, typecheck, 60 unit tests, AI guard, staged diff check, and four local admin route smoke checks.

## Future entry point

Read <code>roadmap/ai/modules/firebase_cost_performance_20260720.md</code> before modifying POS checkout, import transactions, Firestore indexes, shared API behavior, or admin data-loading policy.
