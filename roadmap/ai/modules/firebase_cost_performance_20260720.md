# Firebase Cost & Performance Closeout 2026-07-20

## Status

- **Lifecycle:** CLOSED -> MONITORING
- **Scope:** Firebase read/write cost, POS checkout latency, inventory-import diagnosis, bounded admin loading, and API runtime consistency.
- **Not a deployment assertion:** the latest API/admin refactor is code-validated and pushed; production timing must still be sampled after the normal deployment pipeline.

## Objective achieved

Reduce avoidable Firestore reads and sequential waits without weakening stock, debt, cashier-shift, revenue, voucher, sequential-ID, or idempotency invariants. Make the next performance investigation measurable instead of relying on one opaque request duration.

## Evidence retained for future AI

### POS checkout

- The slow DEBT sample recorded <code>total=7,646ms</code> and transaction callback <code>4,608ms</code>.
- The measured post-migration DEBT sample recorded <code>total=3,639ms</code>, transaction callback <code>2,193ms</code>, and no FIFO query for the classified legacy SKU.
- Core reads are batched, FIFO work overlaps readable-ID reservation, commission/revenue data is reused, and cashier tally movements are idempotent.
- <code>reserveIdsWait</code> around 1.4 seconds remains intentional collision protection for readable sequential document IDs. Do not cache the counter in a server process or remove collision checks merely to improve a benchmark.
- A debt order keeps its DEBT business status independently from the actual received cash/bank channel. Preserve <code>deposit_payment_method</code> and <code>receivedPaymentMethodCode</code> when changing checkout or revenue code.

### Inventory import

- Timing instrumentation isolated the pre-optimization bottlenecks: auth profile read, idempotency, receipt/related-document reads, and readable-ID reservation. One captured <code>complete_import</code> sample was <code>total=11,171ms</code>, including <code>transaction=8,756ms</code> and <code>reserveIds=4,199ms</code>.
- The import path must retain idempotency, receipt version/status guards, supplier/payment accounting, and readable sequential IDs. Optimize independent reads or scheduling first; do not weaken those guards.

### Firebase read/write cost and admin loading

- Large admin collection paths were bounded and the current UI work adds code splitting/lazy requests for settings panels, inventory modal data, POS bank configuration, cashier history, and supplier pages.
- The source-of-truth index set is <code>firestore.indexes.json</code>. Do not recreate retired indexes without an observed Firestore error and a query-to-index justification.
- Existing customer-facing/public DTO, query-limit, and transaction guards remain part of the cost/security contract.

### Central API runtime

- <code>src/lib/api/handler.ts</code> is the common wrapper for the 62 migrated API routes. It supplies a request ID, Server-Timing metadata, normalized malformed-JSON/auth errors, and server-side structured error logging.
- Unexpected 500 responses are generic to callers and retain detailed diagnostics only in server logs correlated by <code>X-Request-Id</code>.
- <code>/api/pos/payment-config</code> requires <code>manage_orders</code> and returns only the QR-payment projection, not admin TOTP or unrelated bank configuration.

## Guardrails that must not regress

1. Firestore transactions read all documents before writes and keep stock, payment, ledger, revenue, and idempotency changes atomic.
2. Do not reintroduce unbounded collection listeners or full collection reads for an initial admin page load; use a bounded query, cursor, exact-ID lookup, or user-triggered load.
3. Do not skip FIFO reads for a product unless its tracking mode is explicitly classified as legacy under the existing migration contract.
4. Do not expose raw internal errors in a new API wrapper or route. Preserve client-safe domain messages for expected 4xx cases and generic messages for unexpected 5xx cases.
5. Treat a cache-hit operation key as valid only when its operation type, reference, actor, and relevant action/payload contract match.

## Validation performed on 2026-07-20

- <code>pnpm lint</code>: 0 errors; 25 pre-existing warnings outside this change scope.
- <code>pnpm typecheck</code>: passed.
- All 60 Node unit tests: passed, including the shared handler internal-error regression and payment-bank projection test.
- <code>AI_GUARD_ALLOW_LARGE_CHANGE=1 pnpm ai:guard</code>: passed.
- Local smoke requests returned 200 for <code>/admin/settings</code>, <code>/admin/inventory</code>, <code>/admin/pos</code>, and <code>/admin/suppliers</code>.
- Staged diff check passed. No production build was run while the local dev server owned <code>.next</code>.

## Current handoff and reopen rules

- **Monitor, do not continue speculative optimization.** Collect production p50/p95 and error-rate samples for POS checkout and inventory import, grouped by request ID and transaction attempt count.
- Reopen a focused investigation only when a reproducible production regression occurs: transaction retries rise, checkout standard flow returns to the earlier 7.6-second class of latency, import latency materially regresses, Firebase read/write dashboards show a renewed unbounded pattern, or the new API wrapper changes a route contract.
- When reopening, begin from timing fields already emitted by the relevant route. Identify the slow phase before changing indexes, transaction order, caching, or business invariants.

## Commits and references

- <code>5509e6ac</code>: POS hot-path timing, FIFO/ID overlap, cashier tally changes.
- <code>bf62f022a</code>: debt deposit channel classification while preserving debt status.
- <code>8838c10f3</code>: common API handler, request observability/error hardening, restricted POS payment config, and lazy admin loading.
- Detailed plan/task/walkthrough: <code>roadmap/ui/data/ai_plans/*firebase_cost_performance_closeout_20260720.md</code>.
