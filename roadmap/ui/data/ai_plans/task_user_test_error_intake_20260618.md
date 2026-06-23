# User Test Error Intake Task List - 2026-06-18

## Collection Phase
- [x] Receive user-tested error reports one by one.
- [x] Record Batch 1 reports in `plan_user_test_error_intake_20260618.md`.
- [x] Record Batch 2 reports in `plan_user_test_error_intake_20260618.md`.
- [x] Record Batch 3 reports in `plan_user_test_error_intake_20260618.md`.
- [x] Record Batch 4 post-code admin performance reports in `plan_user_test_error_intake_20260618.md`.
- [x] Preserve raw user wording and evidence before grouping.
- [x] Group only after enough reports are collected.
- [x] Wait for user confirmation that testing is complete.

## Analysis Phase
- [x] Start only after user confirms all current errors are reported.
- [x] Reproduce or inspect each grouped issue.
- [x] Identify root cause and affected files.
- [x] Propose a fix order by severity and dependency.

## Fix Phase
- [ ] Start only after the analysis phase is approved.
- [ ] Apply scoped code/documentation changes.
- [ ] Run focused verification for touched areas.
- [ ] Update roadmap module statuses and manifest entry.

## Batch 4 Performance Follow-up
- [ ] Inspect current `/admin/repairs` query/list/detail flow and identify active vs terminal read paths.
- [ ] Inspect current `/admin/technician` query/list flow and locate the workflow handoff-ready filter point.
- [ ] Inspect current repair print config and completed-ticket print surfaces.
- [ ] Inspect current repair issue/service suggestion model for multi-service support and pricing hints.
- [ ] Inspect `/admin/products` create/edit modal for remaining manual variant fields.
- [ ] Inspect `/admin/parts` and `/admin/inventory` proposal/ordered ownership before moving logic.
- [ ] Compare `/admin/suppliers` with `/admin/customers` for UI/data parity and lazy-load opportunities.
