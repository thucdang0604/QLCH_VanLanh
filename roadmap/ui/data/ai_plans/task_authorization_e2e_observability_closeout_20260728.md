# Tasks: Authorization, E2E, observability, and modularization closeout — 2026-07-28

## Completed

- [x] Version session authorization and re-check authority in privileged mutations.
- [x] Pre-revoke RTDB chat access before changing Firestore authority and queue reconciliation work.
- [x] Make Emulator runs isolated and prove client RTDB Rules in the default namespace.
- [x] Add authenticated browser/API authorization lifecycle coverage.
- [x] Bound observability data and measure session-validation baseline.
- [x] Decide Phase 4 from evidence: no speculative performance change.
- [x] Extract and test pure POS checkout rules and repair-create input policy.
- [x] Run focused tests and typecheck before final full verification.

## Monitoring only; not an open coding phase

- [ ] Collect production p50/p95, error rate, retry rate, and Firebase cost evidence before re-opening performance work.
- [ ] Investigate only reproducible authorization/reconciliation failures; do not weaken fail-closed behavior as a workaround.
- [ ] Continue POS/Repair refactoring only in small transaction-preserving, test-protected slices.
