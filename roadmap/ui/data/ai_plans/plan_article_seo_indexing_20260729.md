# Article SEO indexing acceleration

- Date: 2026-07-29
- Status: code complete; awaiting editorial approval, normal release, and Search Console operations
- Goal: make published article URLs easy for Google to discover and render, while preventing automated crawls from inflating Firebase usage metrics.

## Delivered technical scope

1. Identify well-known search crawlers only for article-view analytics; their request returns success without rate-limit or Firestore work.
2. Render the `/tin-tuc` article hub from the server with indexable article links, metadata, breadcrumbs, and collection schema. Category tabs remain real links.
3. Keep comments deferred until a real visitor asks to view them, so initial article loads do not query the comments collection.
4. Enforce published-only public article detail, one canonical metadata owner, consistent document-ID canonical URLs, and structured `dateModified`.
5. Generate sitemap `lastmod` values from real Firestore timestamps only; record `publishedAt` in the existing article write when a draft is published.

## Non-goals and guardrails

- Do not use crawler user-agent detection for authentication, authorization, or content access.
- Do not bulk-edit existing article copy, dates, images, titles, or links without editorial review.
- Do not submit Google's Indexing API for normal articles; it is not the supported API path for this content type.
- Do not deploy or submit Search Console URLs until the normal release owner approves the production change.

## Acceptance evidence

- Crawler bypass unit tests pass, including a proof that Googlebot invokes neither the Admin DB nor the rate limiter.
- Typecheck, lint without errors, production build, AI guard, and diff check pass.
- Local production server exposes 19 article links at `/tin-tuc`, working category-tab links, canonical metadata, `BlogPosting` schema, and sitemap article URLs.

## Next operational steps

1. Editorially audit the five highest-value articles and approve any factual/copy changes.
2. Release through the normal Firebase pipeline, then smoke `robots.txt`, sitemap, hub, and two articles on `https://fixphone.vn`.
3. Submit the sitemap in Google Search Console and use URL Inspection only for the selected priority articles; review Coverage/Page indexing and Rich Results after Google recrawls.
