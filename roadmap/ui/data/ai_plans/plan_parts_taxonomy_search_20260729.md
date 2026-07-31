# Parts taxonomy search and cursor pagination

- Date: 2026-07-29
- Status: code complete; awaiting index release and historical data backfill
- Goal: make every assigned part discoverable in `/admin/parts` without reading the complete product catalog into the browser.

## Delivered scope

1. Replace the newest-50 collection read with a taxonomy-scoped cursor query; navigation uses bounded previous/next state instead of an aggregate count.
2. Add the dedicated `component` taxonomy selector to the parts list.
3. Use `searchCategoryKeywords` for taxonomy-plus-search in one bounded Firestore array-membership filter.
4. Keep writers/imports and the backfill script aligned with searchable part name, type, code, model, and category data.
5. Add the required composite Firestore indexes and deterministic query-plan tests.

## Guardrails

- No full product collection listener or client-side global search.
- No query if `component` taxonomy is missing, invalid, or exceeds Firestore's supported root fan-out.
- Do not imply that the current page can globally audit or restore hidden records.
- Do not reintroduce global stock/popularity filters until their data is materialized and queryable server-side.

## Operational next steps

1. Deploy the two catalog indexes normally and wait for their build state to be ready.
2. Run the product backfill in dry-run mode, inspect its counts, then apply only with approved production authority.
3. Smoke-test older and nested-taxonomy parts with the production admin session.
