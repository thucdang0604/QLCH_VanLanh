# Walkthrough: Article SEO indexing - 2026-07-29

## What changed

The public article hub no longer depends on browser-only query state for its primary list and links. Its title, description, canonical URL, breadcrumb, collection schema, article cards, and category links are produced in the initial server HTML. Article detail has one metadata owner, published-only lookup, document-ID canonical URLs, `BlogPosting.dateModified`, and an actual 404 for unavailable content.

Crawler requests to `/api/articles/view` now return a no-op analytics response before body parsing, rate limiting, or Firestore access. This reduces false view counts and avoids the associated Firebase reads/writes. Comment reads are no longer automatic on article load; they start after the visitor selects `Xem bình luận`.

The sitemap no longer claims that every static/category URL was modified at generation time. Product, service, and article `lastmod` values are emitted only from a valid stored timestamp. Publishing an article stores `publishedAt` within the same existing document write.

## Verification record

- Unit: `node --experimental-test-module-mocks --import tsx --test src/lib/searchCrawler.test.ts src/app/api/articles/view/route.test.ts` passed.
- Static checks: `pnpm typecheck`, `pnpm lint` (0 errors; existing unrelated warnings), `git diff --check`, and approved AI guard passed.
- Production build: `pnpm build` passed.
- Local production smoke: `/tin-tuc` rendered 19 server-visible article links and server-side category links; an article detail rendered content, canonical metadata, `BlogPosting`, and the deferred-comment control. Selecting it loaded the empty comment state correctly.

## Remaining boundary

The local browser reported Firebase Installation/anonymous-chat 403 errors because `http://127.0.0.1:3100` is intentionally absent from the API-key referrer allow-list. They are unrelated to article SEO and did not prevent the server-rendered SEO checks.

The two client-only global customer-shell widgets still emit generic Next bailout markers in article-detail HTML. They sit after the fully rendered article/metadata and are outside this SEO slice; do not convert them speculatively without a separately scoped customer-shell performance review.
