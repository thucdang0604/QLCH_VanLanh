# Tasks: Data Scale, Search & Firebase Performance Audit - 2026-06-22

## Phase 1 - Bound high-risk admin reads

- [x] Refactor `admin/inventory/stock` to use paginated query/server API instead of loading all `products`.
- [x] Refactor `admin/inventory` receipt/proposal/order lists to use tab filters, `limit`, `orderBy`, and cursor pagination.
  - [x] Bound `import_receipts` reads on `admin/inventory` with `orderBy(createdAt desc)`, batch size, cursor, and load-more control.
- [x] Refactor `admin/commissions` to load by month/status/staff with bounded queries.
  - [x] Bound commission history reads to the selected month and capped rule/history query sizes.
- [x] Add focused verification for inventory and commission screens.

## Phase 2 - Search paths for large history

- [x] Add bounded phone search for `admin/orders`: `limit(50)` with client-side newest-first merge.
- [x] Add bounded phone/IMEI search for `admin/repairs`.
- [x] Add bounded phone search for `admin/appointments`.
- [x] Ensure empty result distinguishes "not found" from "has records outside current filter" where relevant.

## Phase 3 - POS product-code registry as primary lookup

- [x] Audit all product code creation/update paths and ensure `product_code_registry/{code}` is written for SKU/barcode/productCode/QR aliases.
- [x] Change POS scan/search exact-code path to read registry first as the authoritative one-doc lookup.
- [x] Keep legacy field fallback only for old data and record a backfill task.
- [x] Add verification for SKU, barcode, QR alias, inactive product, and out-of-stock product search.

## Phase 4 - Active vs archive queues for repairs and technician

- [x] Use Firebase repair workflow config to derive active, terminal, and KTV-actionable status groups.
- [x] Make `admin/repairs` load active tickets by default and terminal tickets only in archive tab.
- [x] Make `admin/technician` exclude states where KTV has no more action, especially handoff/customer-delivery states.
- [x] Verify query constraints do not hardcode status names beyond workflow-derived IDs/features.

## Phase 5 - Aggregate-first reporting

- [x] Make revenue page normal path aggregate-only for supported ranges.
- [x] Add admin-only aggregate repair/backfill action or script for missing historical days.
- [x] Add commission monthly aggregate for dashboard/list totals.
- [x] Add inventory/import monthly summary if receipt history becomes large.

## Phase 6 - Reconcile legacy debt-payment data

- [x] Write dry-run script/API to find POS orders that only represent old debt collection.
- [x] Mark bad debt-collection POS orders as excluded/voided, or output manual review list before mutation.
- [x] Recompute affected revenue aggregates.
- [x] Recompute affected customer debt/totalSpent/payment history if needed.
- [x] Produce before/after report for user validation.

## Phase 7 - Customer detail and popup smoothness

- [x] Change customer activity/detail history to "recent 20 + load more" instead of full realtime history.
- [x] Keep realtime only for active unpaid/open orders, active repairs, and pending appointments.
- [x] Add or update customer summary fields for debt, last activity, and open payable counts.
- [x] Cache selector data for services/media/suppliers where safe.

## Verification Checklist

- [x] `git diff --check`.
- [x] Focused ESLint for each touched admin route/component.
- [x] `next typegen && tsc --noEmit`.
- [x] Browser smoke: POS lookup, inventory list, revenue day/range, repair active/archive, technician queue.
- [x] Firebase read-count spot check before/after on at least POS, inventory, revenue, repairs.
