# Article SEO indexing - 2026-07-29

- **Status:** code complete, awaiting editorial/release operations
- **Severity:** high discoverability; low business-logic risk
- **Module:** CustomerWeb / SystemContent
- **Files:** `src/lib/searchCrawler.ts`, `src/app/api/articles/view/route.ts`, `src/app/(customer)/tin-tuc/page.tsx`, `src/app/(customer)/tin-tuc/page.client.tsx`, `src/app/(customer)/tin-tuc/[slug]/page.tsx`, `src/app/(customer)/tin-tuc/[slug]/ArticleClientParts.tsx`, `src/app/sitemap.ts`, `src/features/articles/ArticleEditorModal.tsx`

## Problem

Production discovery had a valid robots file and sitemap, but the article hub's primary content was browser-rendered. This weakened crawl discovery compared with server-visible anchors and metadata. The article view effect could also count an automated crawler as a human view and cause a rate-limit transaction plus an article write. Sitemap timestamps were not consistently tied to source data.

## Implemented correction

The article hub now renders its list, links, metadata, breadcrumb, and collection schema on the server. Article detail is published-only, has one canonical metadata path, returns 404 for unavailable content, and publishes canonical URLs based on the Firestore document ID. Crawler view calls are analytics no-ops, comments load on intent, and sitemap dates derive from stored timestamps. The article editor writes `publishedAt` as part of its existing document write when publishing.

## Firebase impact

- A recognized crawler avoids the prior view route's rate-limit Firestore transaction and article update.
- Human article views retain the existing analytics behavior.
- Initial article loads no longer read comments; a real user requests that data explicitly.
- No extra article write is introduced by `publishedAt`; it is part of the existing save/update operation.

## Verification and next action

Typecheck, lint with no errors, crawler unit tests, AI guard, diff check, build, and local production browser smoke passed on 2026-07-29. The next steps are editorial approval of priority content, normal Firebase release, then production Search Console sitemap/URL inspection. Do not use Google Indexing API for ordinary articles.
