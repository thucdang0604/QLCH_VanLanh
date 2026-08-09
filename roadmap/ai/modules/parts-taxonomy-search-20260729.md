# Parts taxonomy search and pagination - 2026-07-29

- **Status:** code complete; Firestore indexes deployed and building, historical-index backfill remains operational follow-up
- **Severity:** high discoverability and Firebase-read cost; low inventory-business-logic risk
- **Module:** Admin inventory catalog
- **Files:** `src/app/admin/parts/page.tsx`, `src/app/admin/products/page.tsx`, `src/app/admin/pos/page.tsx`, `src/app/admin/inventory/stock/page.tsx`, `src/lib/constants.ts`, `src/lib/partCatalogQuery.ts`, `src/lib/firestoreQueryHelper.ts`, `src/lib/firestoreLogger.ts`, `src/lib/firestoreReadMetrics.ts`, `src/lib/useFirestore.ts`, `src/components/admin/UniversalProductModal.tsx`, `src/components/admin/ExcelImportModal.tsx`, `scripts/backfill-catalog-search-index.mjs`, `firestore.indexes.json`

## Problem

`/admin/parts` previously read the newest 50 product documents, then filtered them in the browser. With more than 2,000 parts, every older part was undiscoverable from this screen. Searching, taxonomy filtering, and the restore-hidden action only acted on that 50-document slice.

## Implemented correction

The list is now a bounded Firestore query, not a realtime collection listener. It first resolves the configured `component` taxonomy, then loads one cursor page (default 20, selectable 20/50/100). It does not run an aggregate count across the matching catalog on page open.

| User state | Firestore membership field | Query shape |
| --- | --- | --- |
| All parts | `categoryIds` | `array-contains-any` configured component roots |
| A taxonomy node | `categoryIds` | `array-contains` the deepest selected node; descendants retain ancestor IDs |
| Search all parts | `searchCategoryKeywords` | `array-contains-any` root-plus-normalized-search tokens |
| Search within node | `searchCategoryKeywords` | `array-contains` deepest-node-plus-normalized-search token |

The page keeps editable text separate from the applied search term: only **Tìm** or Enter starts a Firestore search. It does not issue a query until taxonomy configuration is available. Invalid/missing taxonomy, or more than 30 component roots, fails closed instead of broadening to all `products`.

Component create/edit and part Excel import now include part type and code prefixes in `searchKeywords`; `searchCategoryKeywords` is derived from the assigned category IDs. The existing backfill script now includes legacy part type/model/compatible-model values when it rebuilds product search indexes.

The Parts page mounts a component-mode `UniversalProductModal`, so its retail-only brands data is now disabled unless the modal is open in retail mode. This removes the previous 20-document `brands` listener/read from every Parts page visit.

The scalar component category is also enforced in the Parts query, preventing a retail product with an overlapping taxonomy ID from entering the components list. Products now scopes its initial query to retail before pagination, POS derives retail roots from live configuration rather than `DEFAULT_CONFIG`, and Stock uses the same component classifier. All three catalog search boxes now query only after **Tìm** or Enter.

Stock's **Bán lẻ & Phụ kiện** and **Linh kiện** tabs now also scope their 100-document cursor page by the configured top-level `retail` or `component` taxonomy IDs. This fixes the case where the first alphabetical 100 documents were parts and client-side filtering made the retail tab appear empty. A submitted Stock search uses the precomputed `searchCategoryKeywords` entries for the same root IDs, so it stays scoped without combining incompatible Firestore array filters.

The development logger now distinguishes server/cache snapshots, result-document count, listener change count, and a document-read estimate/range. It no longer presents the total size of a listener snapshot as the cost of every update. Count aggregation logs its result separately and explicitly states that index-entry billing cannot be derived from the Web SDK response.

## Deliberate boundaries

- The configured composite indexes were deployed to `qlch-vanlanh` on 2026-07-29. Firestore reported the category index as building immediately after deployment; it must become Enabled before that query is usable.
- Existing documents need the backfill script's read-only dry run and an explicitly approved apply run; neither was executed against production in this implementation.
- The prior "Khôi phục ẩn" control was removed from this page because it only audited the loaded slice. A separate, bounded maintenance/audit screen is required before offering a global restore workflow.
- Global `Hết hàng` / `Dùng nhiều` filters are not retained as client-side filters. `Hết hàng` needs a materialized availability field or dedicated server query; deriving it from a cursor page would be misleading.

## Verification and release checklist

- Focused lint, TypeScript check, and eight deterministic query-plan/read-metric tests pass.
- Production build (116 routes), JSON parsing for index/roadmap data, and `git diff --check` pass. The follow-up removes the aggregate-count read; the parts UI uses bounded previous/next cursor navigation.
- Wait for the deployed indexes to become Enabled, then run `node scripts/backfill-catalog-search-index.mjs --collection products --dry-run` under approved credentials. Review counts before the separate `--apply --confirm BACKFILL_CATALOG_SEARCH_INDEX` operation.
- After release, verify an old part, a nested taxonomy part, and a two-character-plus search from a logged-in `/admin/parts` session.
- Verify `/admin/inventory/stock` after index readiness: switch to **Bán lẻ & Phụ kiện**, **Linh kiện**, search only with **Tìm**/Enter, and use **Tải thêm** to confirm the cursor stays inside the selected taxonomy scope.
