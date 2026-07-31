# Tasks: Article SEO indexing - 2026-07-29

## Completed in code

- [x] Stop known search crawlers from incrementing article views or touching the rate limiter/Firestore.
- [x] Make the article hub server-rendered with crawlable category and article anchors.
- [x] Defer public comment reads until a visitor explicitly requests comments.
- [x] Return 404 for missing/unpublished articles and consolidate detail metadata ownership.
- [x] Align canonical article URLs, sitemap URLs, and article editor timestamps.
- [x] Add unit coverage and production-build/browser smoke evidence.

## Requires editorial or release authority

- [ ] Approve the priority list and factual/copy changes for the first five articles.
- [ ] Release the validated change through the normal Firebase deployment pipeline.
- [ ] Verify live HTML, robots, sitemap, canonical, and structured data after release.
- [ ] Submit the sitemap in Search Console and request indexing for selected high-priority article URLs.
- [ ] Monitor Indexing/Coverage and Rich Results for 7/14/28 days; only investigate a URL after its inspection result identifies a specific cause.
