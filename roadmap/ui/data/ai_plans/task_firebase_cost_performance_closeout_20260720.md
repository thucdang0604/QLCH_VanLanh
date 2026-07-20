# Tasks: Firebase cost and performance closeout - 2026-07-20

## Completed

- [x] Record POS checkout timing evidence and preserve the reason for the remaining readable-ID reservation wait.
- [x] Preserve debt status separately from the received payment channel in POS and revenue paths.
- [x] Record inventory-import timing phases and protect its transaction contracts during optimization.
- [x] Keep the configured Firestore index file as the source of truth and avoid undocumented index recreation.
- [x] Add deferred/lazy loading to the affected admin surfaces without changing business workflow behavior.
- [x] Migrate the current 62 changed API routes to the shared runtime wrapper.
- [x] Add request correlation and Server-Timing metadata, then prevent unexpected 500 errors from leaking internal messages.
- [x] Restrict POS payment configuration to the minimum QR-payment projection and <code>manage_orders</code> permission.
- [x] Run lint, typecheck, unit tests, guard, smoke checks, staged diff validation, commit, and push.

## Monitoring only; not an open coding phase

- [ ] Capture a new production p50/p95 sample for POS checkout and inventory import after normal deployment.
- [ ] Reopen only with a timing log, Firestore cost evidence, or an API-contract regression; do not resume broad speculative refactoring.
