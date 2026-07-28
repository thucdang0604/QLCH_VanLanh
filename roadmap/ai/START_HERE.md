# START HERE — AI task router

This is the required entrypoint before changing code in this repository. It prevents a new AI from treating an old roadmap summary as proof of current runtime behavior.

## Evidence order

When sources disagree, use this order:

1. Current source code, Firebase Rules, and current configuration.
2. Tests or Emulator/browser commands run in the current worktree.
3. The newest module closeout and the latest applicable entry in `.agents/coordination/`.
4. `roadmap/ui/data/source_intelligence.json` as an architecture index.
5. Historical plans, walkthroughs, and dashboard text.

Never claim a file, test, API route, metric, or workflow state without checking it in the current worktree. A roadmap document is a handoff, not a replacement for source verification.

## Always read first

1. `AGENTS.md` — repository safety, business review, and validation rules.
2. This file — selects the smallest task-specific reading set.
3. `roadmap/ai/dashboard.md` — current lifecycle and monitoring boundaries.
4. `roadmap/ui/data/source_intelligence.json` — locate collections, APIs, and cross-file links; verify all relevant details in source.

If another AI is implementing sequentially, also read the latest decision in `.agents/coordination/codex-gemini-review.md` before changing code. Do not advance a phase without an explicit `APPROVED`, `CHANGES REQUIRED`, or `STOP` decision.

## Read by task type

### Auth, RBAC, session, or chat access

1. `roadmap/ai/modules/authorization_e2e_observability_closeout_20260728.md`
2. `.agents/coordination/codex-gemini-review.md` (latest relevant decision)
3. `src/middleware.ts`, `src/lib/sessionCookie.ts`, `src/lib/apiAuth.ts`
4. `src/app/api/auth/session/route.ts`, `src/app/api/admin/staff/update/route.ts`, `src/lib/authorizationProjection.ts`
5. `firestore.rules`, `database.rules.json`, `e2e/tests/authorization-lifecycle.spec.ts`

Invariant: a stale cookie or obsolete RTDB role grant must fail closed. A demotion/logout requiring chat revocation returns 503 before the Firestore authority change if pre-revocation cannot complete.

### POS, orders, cashier, debt, revenue, stock, or FIFO

1. `roadmap/ai/modules/firebase_cost_performance_20260720.md`
2. `roadmap/ai/modules/pos-orders.md`
3. `src/lib/posCheckoutRules.ts`, `src/app/api/pos/checkout/route.ts`
4. `src/lib/inventoryFifo.ts`, `src/lib/cashierShiftTallyServer.ts`, `src/lib/revenueAggregateServer.ts`, `src/lib/commissionCalcServer.ts`, `src/lib/serverDocumentIds.ts`
5. Relevant focused tests and `e2e/tests/*` checkout coverage.

Invariants: keep all Firestore reads before writes; retain atomic stock/held/FIFO, debt, cashier, revenue, readable-ID, and idempotency behavior. A DEBT order status is separate from the money actually received via `deposit_payment_method` / `receivedPaymentMethodCode`.

Do not reopen performance work from a local number alone. The current performance closeout is `CLOSED -> MONITORING`; require production p50/p95, retry rate, Firebase cost, or a timing phase that identifies the bottleneck.

### Repair, warranty, parts reservation, or technician workflow

1. `roadmap/ai/modules/repair.md` and `roadmap/ai/modules/repair_workflow_v2.md`
2. `src/lib/repairCreateInput.ts`, `src/app/api/repairs/create/route.ts`
3. `src/app/api/repairs/transition/route.ts`, `src/app/api/repairs/handover/route.ts`
4. `src/lib/repairWorkflowConfig.ts`, `src/lib/repairWorkflowServer.ts`, `src/lib/repairPartReservations.ts`, `src/lib/repairPartConsumption.ts`, `src/lib/repairWarrantyRules.ts`
5. Focused repair unit tests and applicable E2E coverage.

Invariant: repair and warranty workflows are configuration-driven `WorkflowNode[]` values from `system_config/repairs`; never assume a fixed number or name of statuses. Preserve ticket versioning, assigned-technician gates, held/consumed quantities, payment, warranty, and idempotency contracts.

### Firebase Emulator, Playwright, observability, or SLO

1. `.agents/coordination/codex-gemini-review.md`
2. `scripts/e2e/run.ts`, `scripts/e2e/config.ts`, `scripts/e2e/harness.ts`, `scripts/e2e/inside-emulator.ts`
3. `e2e/tests/authorization-lifecycle.spec.ts`, `e2e/tests/observability-slo.spec.ts`, `e2e/tests/rbac-smoke.spec.ts`
4. `src/lib/observability.ts`, `src/lib/api/handler.ts`, `src/lib/firebase.ts`, `src/lib/firebaseAdmin.ts`

Invariant: use the rules-backed `${projectId}-default-rtdb` namespace, unique run artifacts, and authenticated browser sessions. A client `permission_denied` after demotion is expected proof, not an E2E failure.

## Verified corrections and known coverage boundary

- The E2E entrypoint is `scripts/e2e/run.ts`; do not reference a nonexistent `scripts/e2e/runner.ts`.
- `CustomerDetailDrawer` bounds its direct appointments and customer-transaction listeners with `limit(20)`. Orders and repairs are loaded by `useCustomerActivity` with bounded `getDocs` queries (`limit(50)`), while its remaining realtime listener watches repair workflow configuration.
- POS checkout calls `requirePermission` before its Firestore transaction and does not re-read `users/{uid}` in that transaction.
- There is no direct `inventoryFifo.test.ts` or `commissionCalcServer.test.ts`. Do not call FIFO directly unit-tested without adding a focused test; present coverage is through route/invariant behavior.

## Required handoff after each meaningful slice

1. State goal and exact scope.
2. List changed files and business/authorization impact.
3. Run focused tests, then typecheck; run Emulator/browser proof when touching auth, Rules, POS, repair, or realtime access.
4. Record exact commands/results, assumptions, rollback, and a review decision in `.agents/coordination/codex-gemini-review.md`.
5. Update the relevant roadmap module, `source_intelligence.json` for structural facts, and a registered plan/task/walkthrough only for a new substantial workstream.
