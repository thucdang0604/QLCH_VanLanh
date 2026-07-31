# Tasks: Parts taxonomy search and cursor pagination - 2026-07-29

## Completed in code

- [x] Limit list reads to taxonomy-scoped cursor pages with bounded previous/next navigation; do not aggregate-count the full catalog on open.
- [x] Add component-taxonomy filtering to `/admin/parts`.
- [x] Make name/code/type search compatible with the selected taxonomy node.
- [x] Prevent missing/unsafe taxonomy configuration from broadening to all products.
- [x] Update component writers, Excel import, backfill behavior, and Firestore index configuration.
- [x] Remove the misleading slice-only restore-hidden action from the list page.
- [x] Add focused query-plan coverage and static validation.
- [x] Do not subscribe to `brands` when the component modal is mounted on Parts.
- [x] Upgrade development Firestore logs to report cache/server source and listener changes rather than labeling full snapshot size as every callback's reads.

## Requires release authority

- [x] Deploy `firestore.indexes.json` to `qlch-vanlanh`; Firestore reported the category index building immediately afterward.
- [ ] Confirm both catalog query indexes are Enabled, then smoke-test the list.
- [ ] Run backfill dry-run for `products`; record the candidate/update count.
- [ ] Approve and apply historical search-index backfill if its dry-run evidence is acceptable.
- [ ] Verify old, nested taxonomy, and text-search records on `https://fixphone.vn/admin/parts` after release.

## Deferred as separate work

- [ ] Build a bounded admin maintenance workflow for global archived/hidden-part audit and restore.
- [ ] Define and materialize a global availability/sales projection before adding `Hết hàng` or `Dùng nhiều` query filters.
