# Walkthrough: Parts taxonomy search and cursor pagination - 2026-07-29

## What changed

The parts page no longer reads a fixed newest-50 product slice. It reads only a cursor page from the configured component taxonomy; it intentionally does not use a Firestore aggregate for an exact matching total on every open. Selecting a taxonomy node works for its descendants because each product's `categoryIds` contains its full hierarchy.

Typing does not query Firestore. Two or more characters are normalized and queried against the precomputed `searchCategoryKeywords` entries only after the operator presses **Tìm** or Enter. This keeps taxonomy and text search server-side without combining multiple Firestore array filters or downloading the catalog to filter it locally.

New/edited components and part Excel imports write code/type-aware search terms. The existing product backfill can rebuild the equivalent historical indexes, including legacy model fields. A stale in-flight pagination response is ignored after a filter/query change, preventing an old page from replacing the new result.

The component modal no longer subscribes to the retail-only `brands` collection. It only enables that listener when an open retail modal renders the brand selector. The Firestore development logger now reports snapshots from cache separately, reports listener `added`/`modified`/`removed` changes, and labels document-read values as estimates with explicit billing boundaries.

The same applied-search behavior now covers Products, POS, and Stock. Products' initial page is retail-scoped before pagination, POS reads current configured retail taxonomy roots rather than defaults, and Stock uses the shared component classifier.

Stock now applies its selected retail/component taxonomy roots before loading each 100-document cursor page. This replaces the previous "load generic first page, then filter tabs locally" behavior that could leave the retail tab empty after a parts-heavy catalog import. Its submitted search is constrained with root-plus-search entries from `searchCategoryKeywords`; typing alone remains read-free.

## Verification record

- `pnpm exec eslint ...` for touched parts/catalog files passed.
- `pnpm typecheck` passed.
- `node --import tsx --test src/lib/firestoreReadMetrics.test.ts src/lib/partCatalogQuery.test.ts` passed: 8/8.
- `pnpm build` passed with 116 routes; `firestore.indexes.json`, manifest, and source intelligence JSON parsing plus `git diff --check` passed.
- After the Stock scope correction: focused Stock ESLint, TypeScript, index JSON duplicate validation, `pnpm build` (116 routes), and `git diff --check` passed. Firestore indexes were deployed successfully to `qlch-vanlanh` without `--force`.

## Remaining boundary

The Firestore index configuration was deployed to `qlch-vanlanh` and reported building immediately afterward; historical search-index backfill was not run. The retired restore-hidden button did not have global audit semantics; it must return only as a separate maintenance workflow with its own bounded queries and verification.
