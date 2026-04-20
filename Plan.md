
---

<!-- ========================================================
     [HUMAN] — Phần này dành cho bạn đọc, AI bỏ qua
     ======================================================== -->
## [HUMAN] Ghi chú dự án

### Tổng quan
Hệ thống quản lý cửa hàng sửa chữa điện thoại, laptop — Văn Lành Service.
Gồm 2 nhóm: **Admin** (nhân viên/quản lý) và **Customer** (khách hàng).

### Những quyết định quan trọng đã chốt
- **Ảnh**: Dùng component `LazyImage/ProductThumbnail/BannerImage` — không dùng `<Image>` thô vì Firebase Hosting không support proxy ảnh của Next.js
- **Data customer**: Dùng Server Components + server-queries.ts để có SEO — không dùng useFirestore ở customer pages
- **Pagination**: Hook `useClientPagination` + component `PaginationBar` — đã có sẵn, chỉ cần tích hợp vào 13 trang còn lại
- **Storage**: Đã migrate sang Singapore (asia-southeast1) — load ảnh nhanh hơn nhiều
- **CDN**: Cloudflare đã setup — static assets cache 1 năm

### Vấn đề hay gặp với AI
- AI hay đề xuất lại cách cũ sau vài ngày → file này để ngăn điều đó
- AI hay refactor ngoài scope → nhắc "minimal diff only"
- AI hay dùng `any` trong TypeScript → không chấp nhận

### Việc đang chờ làm
1. Audit aria-label các nút icon-only
2. Phase 3 (Geofenced Review): Setup Geolocation + Haversine trên `/rate`, PIN fallback, Server-side rate limit API, và Admin Settings config (toạ độ/bán kính/PIN). 
3. ~~Phase 4 (Inventory Overhaul): Hoàn thiện `UniversalProductModal`, refactor `products`, `parts`, `inventory`, và `pos` để hợp nhất.~~ ✅ DONE

---

<!-- ========================================================
     [AI_CONTEXT] — AI đọc từ đây, bỏ qua phần [HUMAN] ở trên
     ======================================================== -->
## [AI_CONTEXT]

> READ THIS SECTION ONLY. Skip [HUMAN] above.
> After task complete → append entry to CHANGE LOG below.

### CONSTRAINTS (non-negotiable)
- Minimal diff. No refactor outside scope.
- No `any`. No `@ts-ignore` without reason.
- Propose alt approach → explain + confirm before coding.
- UI strings → Vietnamese only.
- Spec file exists → follow exactly.
- Heavy libs (react-quill, charts) → `dynamic(() => import(...), { ssr: false })`.
- **Firebase Reads**: ALWAYS use `limit(50)` and `startAfter()` for pagination. NEVER use unbounded `onSnapshot`. Walk-in repair tickets must NOT fetch the whole appointment list.
- **Double-Entry Inventory**: `stock` and `held` counts MUST balance. ONLY use `writeBatch` in `api/checkout` to do `stock -N` and `held +N`. No direct loose decrements.

### DECISIONS

**Image**
- Use: `LazyImage` / `ProductThumbnail` / `BannerImage` from `src/components/ui/LazyImage.tsx`
- Admin small thumb: `<Image width={48} height={48} />` direct OK
- Why: Firebase Hosting Cloud Run blocks `/_next/image` proxy → custom loader returns raw URL
- Result: No auto WebP via Next.js. WebP converted at upload via `imageOptimizer.ts`
- NEVER: add `formats:['image/webp']` to next.config.ts, use raw `<Image quality={n} />` for product/banner

**Data Fetching**
- Admin: `useFirestore(collectionName)` — realtime, no raw Firebase in component
- Customer (`src/app/(customer)/`): RSC `page.tsx` → calls `server-queries.ts` → passes data to `page.client.tsx` as props
- Server queries: `fetchCategoryItems` `fetchArticles` `fetchDetailItem` `fetchArticleDetail` `fetchFlashSaleProducts`
- NEVER: add `useFirestore` to customer pages

**Pagination**
- Hook: `src/lib/useClientPagination.ts` | UI: `src/components/admin/PaginationBar.tsx`
- Empty state: check `filtered.length` NOT `paginated.length`
- Stats/aggregate: always from master array
- Full spec: `PAGINATION_SPEC.md`
- NEVER: server-side pagination, infinite scroll, external lib

**State**
- Persistence: Firestore. UI local: React state.
- NEVER: localStorage, sessionStorage, Redux, Zustand

**Shared Components**
- Modal: `src/components/admin/Modal.tsx`
- Image picker: `src/components/admin/MediaManager.tsx` (only source)
- Product/part create: `src/components/admin/UniversalProductModal.tsx`
- Cart: `src/components/CartDrawer.tsx`
- NEVER: new inline `fixed inset-0` modal, new image picker inside page file

**Security**
- API keys: server-side only in `src/app/api/` routes
- Checkout logic (stock+ratelimit+honeypot): `api/checkout/route.ts` — do not duplicate on client
- Reviews logic (geo+ratelimit): `api/reviews/route.ts` — do not move to client
- RBAC: role `staff` forbidden from `/revenue` `/appearance` `/settings` `/staff`

**Infra (done — do not re-suggest)**
- Storage: `asia-southeast1` ✅
- next.config.ts: custom loader + remotePatterns + optimizePackageImports ✅
- Cloudflare CDN: static cache 1yr, `/api/*` `/admin/*` bypass ✅
- Shared components: Modal, MediaManager, UniversalProductModal, CartDrawer, PaginationBar ✅

**Upload pipeline**
- Flow: file → `validateImage.ts` (max 2MB, jpg/png/webp) → `imageOptimizer.ts` (canvas→WebP) → Firebase Storage

### KNOWN ISSUES (do not retry)
| Issue | Tried | Result | Decision |
|---|---|---|---|
| Auto WebP via Next.js | `formats:['image/webp']` in next.config.ts | No effect, custom loader active | Convert at upload via imageOptimizer.ts |
| `/_next/image` proxy | Default Next.js | Crash on Firebase Hosting Cloud Run | Disabled via custom loader |
| useFirestore in customer | Client-side fetch | No SSR → bad SEO, slow | RSC + server-queries.ts |

### CHANGE LOG
> Format: `### [YYYY-MM] Task` / `F:` files / `W:` what / `Y:` why / `N:` notes

### [2026-04] Init Plan.md + update skil-VL.md
F: `Plan.md` (new), `skil-VL.md` (rewrite), `vl.md` rule (new), `wfvl.md` workflow (new)
W: Created decision log. Rewrote skill to match actual codebase from repomix.
Y: AI kept re-suggesting old patterns. Skill had wrong image pattern + wrong customer data fetching pattern.
N: Old skill deprecated. Always use updated skil-VL.md.

### [2026-04] Phase 2 & 3: Checkout, Inventory, Firebase Reads Optimization
F: `src/lib/types.ts`, `src/app/api/checkout/route.ts`, `src/app/admin/*`
W: Added `held` to Product. Used writeBatch for stock/held. Changed onSnapshot to limit(50)+startAfter. Removed appointment dropdown in Create Ticket.
Y: Prevent over-sell (stock double-entry). Slash Firebase costs by stopping full reads.
N: Never update stock loosely. Walk-in tickets now employ manual inputs.
### [2026-04] Fix SSR Deployment Errors & Unify Media storage
F: src/app/admin/articles/page.tsx, firebase.json
W: Unified all article-related uploads to media/ folder, enforced .webp via imageOptimizer.ts, and added Firestore registration to media_library. Increased SSR memory to 512MiB and granted roles/datastore.user to compute service account.
Y: Fix "Application error" (OOM + Permission Denied) on production. Fix missing thumbnails and AI images in Media Manager.
N: IAM grant may take 1-5 mins to propagate. Next.js 15 requires >= 512MB for stable SSR on Firebase.

### [2026-04] Cấu trúc phân mục cho MediaManager
F: `src/components/admin/MediaManager.tsx`
W: Tích hợp logic lưu trữ theo Folder (Chung, Sản phẩm, Tin tức...). Bổ sung `<select>` để gán thư mục lúc upload và `<select>` bộ lọc hiển thị ở giao diện Library.
Y: Chống phân mảnh Storage (chuẩn hoá `media/[folder]/`). Tuân thủ thiết kế "MediaManager là nguồn quản lý ảnh duy nhất của toàn hệ thống".
N: Dữ liệu ảnh rác cũ đã được user chủ động xoá, nên không cần chạy script data migration tốn kém. Mọi upload mới đều auto chuẩn hóa.

### [2026-04] File Dependency Graph — Standalone Dev Tool
F: `scripts/generate-graph.js` (rewrite), `dev-tools/file-graph/index.html` (new), `dev-tools/file-graph/serve.js` (new), `FILE_DEPENDENCIES.md` (generated), `package.json`
W: Standalone dev tool chạy riêng trên port 3333 — không tích hợp vào Next.js. Cytoscape.js từ CDN (zero deps). Script xuất 2 output: JSON (cho HTML visualizer) + `FILE_DEPENDENCIES.md` (cho AI đọc). Xoá trang cũ `/admin/dev-tools/file-graph`, gỡ `@xyflow/react`.
Y: User muốn tool chạy song song, hỗ trợ AI model hiểu dependency để khi sửa code sẽ update toàn bộ file liên quan.
N: Chạy `npm run graph` để cập nhật data → `npm run graph:serve` để mở UI tại localhost:3333. FILE_DEPENDENCIES.md có impact summary (Top 20) + transitive dependency chain cho từng file.

### [2026-04] QA Audit: Image/Media Pipeline Performance Fixes
F: `src/lib/imageOptimizer.ts`, `src/lib/storage.ts`, `src/components/admin/MediaManager.tsx`, `src/app/admin/articles/page.tsx`, `src/lib/validateImage.ts`
W: [CRITICAL] Added `limit(200)` to MediaManager onSnapshot. Replaced Canvas with `createImageBitmap`+`OffscreenCanvas` (off main-thread). Paginated `cleanBrokenMedia` (batch 50). [HIGH] Fixed memory leak from unreleased `URL.createObjectURL` in articles. Added `validateImageFile()` guard before `optimizeImage()`. Removed double memory alloc (`arrayBuffer+Uint8Array` → pass `File` directly to `uploadBytes`).
Y: PageSpeed audit: high TBT from main-thread canvas, Firebase cost from unbounded onSnapshot, memory leaks.
N: `validateImage.ts` existed but was never called. Pre-existing type error in `tracking/page.tsx` also fixed (untyped Firestore map).

### [2026-04] AI_FILE_MAP.md — Compact Dependency Reference for AI
F: `scripts/generate-graph.js` (updated), `AI_FILE_MAP.md` (new, generated), `.agents/rules/rulesvl.md`
W: Script now outputs 3 files: JSON (visualizer) + FILE_DEPENDENCIES.md (full detail) + AI_FILE_MAP.md (compact, 140 lines). AI_FILE_MAP uses adjacency list format — one line per file showing all importers + transitive count. Added to mandatory AI rules (step 3).
Y: Giảm token/quota cho AI — đọc 140 dòng thay vì phải đọc toàn bộ source files để hiểu dependency.
N: Chạy `npm run graph` khi thêm/xoá/di chuyển file. Format: `file ← [importers] (Nd, Mt)` — d=direct, t=transitive.

### [2026-04] Phase 3: Geofenced Review System
F: `src/lib/config-defaults.ts`, `src/lib/ConfigContext.tsx`, `src/app/api/reviews/route.ts`, `src/app/(customer)/rate/page.tsx`, `src/app/admin/settings/page.tsx`
W: Added `GeofenceConfig` type (enabled, lat, lng, radiusMeters, pin) to SiteConfig. Enhanced API with daily rate limit (3/IP/day), server-side Haversine geo verification, PIN fallback, and GET endpoint for public config. Rate page now checks GPS on mount → shows PIN input if denied/out-of-range → verification badge on form. Admin Settings has new "Xác minh đánh giá (Geofence)" section with toggle, lat/lng/radius inputs, "Lấy vị trí hiện tại" button, and PIN config.
Y: Prevent fake reviews from outside the store. QR scan → geofence check ensures authenticity. PIN fallback handles indoor GPS issues.
N: Feature is OFF by default (`geofence.enabled: false`). When off, review form works exactly as before — zero breaking changes. No new files created (only modified existing), no need to run `npm run graph`.

### [2026-04] Phase 4: Inventory Overhaul — UniversalProductModal + Atomic POS
F: `src/components/admin/UniversalProductModal.tsx` (new), `src/app/admin/products/page.tsx`, `src/app/admin/pos/page.tsx`, `src/app/admin/inventory/page.tsx`, `src/app/admin/parts/page.tsx`, `AI_FILE_MAP.md`
W: Created `UniversalProductModal` (retail + component modes, slug gen, MediaManager integration). Refactored all 4 admin pages to use shared modal — removed ~500 lines of duplicated inline modal code (`ProductModal`, `POSProductModal`, `InlineProductCreateModal`, `InlinePartCreateModal`, `PartModal`). POS checkout now uses `writeBatch` for atomic stock/held updates (Double-Entry Inventory). Inventory page uses `limit(50)` + `orderBy('createdAt','desc')` for product fetching.
Y: Code duplication across 4 pages made product management logic fragile and hard to maintain. Unbounded product fetches caused high Firebase read costs. Non-atomic stock updates risked data inconsistency.
N: `initialData` prop uses `Record<string, any> & { id: string }` to avoid strict type conflicts between page-local Product interfaces. `npm run graph` regenerated — UniversalProductModal shows as shared dep of 4 admin pages.

### [2026-04] QA & System Backtest: Stress Testing Framework
F: `BACKTEST_PLAN.md` (new), `LOAD_TEST_SCENARIO.md` (new), `src/app/api/dev/seed-data/route.ts` (new), `src/components/admin/UniversalProductModal.tsx`
W: Created comprehensive manual QA backtest plan for 12 core features. Created load testing scenario (100 customers, 10 staff) emphasizing race conditions, stock balances, and rate limits. Added `/api/dev/seed-data` endpoint to generate 130 mock products/parts/services for local testing. Fixed "Sửa" button bug in UniversalProductModal by adding useEffect to sync state with new `initialData`.
Y: Ensure stable user experience post-refactoring. Provide a structured QA approach. The modal's edit bug prevented editing different products quickly due to un-reset state.
N: `npm run graph` regenerated since a new API route was added. The seed-data endpoint is strictly gated to development environment.

### [2026-04] QA & System Backtest: Fix Parts Permissions
F: `src/app/admin/parts/page.tsx`
W: Fixed Firebase error `Missing or insufficient permissions` at `/admin/parts` by resolving incorrect collection name (`repair_tickets` instead of `repairs`) and legacy property mapping (`selectedParts` instead of `parts`) inside `handleFinalizeReceipt` and `handleMarkAvailability`.
Y: Firebase rules block non-existent collections. The collection `repair_tickets` does not exist in rules. Phase 4 already refactored `selectedParts` into `parts` system-wide.
N: No new files or deps. `npm run graph` not needed.

### [2026-04] QA & System Backtest: Fix Missing Price & ProductId on Part Sync
F: `src/app/admin/parts/page.tsx`
W: Fixed an issue in `/admin/parts` where finalizing an import for a custom component (`custom_...`) did not propagate the newly generated `productId`, `unitCostAtUse`, and `unitPriceAtUse` back to the repair ticket's `parts` array.
Y: The repair ticket needs the finalized product ID to link to the global product list and needs the updated price/cost to display pricing clearly to the technicians once it's in stock.
N: Maintained existing availability toggles. Directly cached map updates. No new files or deps. `npm run graph` not needed.

### [2026-04] QA & System Backtest: Fix Repair Workflow Transitions & Inventory holding
F: `src/app/admin/repairs/page.tsx`, `src/app/admin/technician/page.tsx`, `src/app/admin/parts/page.tsx`
W: Enabled strict `writeBatch` in `handleHandover` and `handleTechHandover` to release parts (`held`) atomically. In technician page, increment/decrement `held` exactly parallel to `stock` when adding/removing tools. Refactored `executeFinalImport` in `admin/parts/page.tsx` to automatically decrement stock, increase holding constraints and assign unit price onto the RepairTicket seamlessly for pending receipts.
Y: Maintain strict double-entry inventory and prevent ghost stock discrepancies when parts move between stock and holding states.
N: Ensured no race conditions by leveraging `increment` inside Firestore transactions and batches. No new files or deps. `npm run graph` not needed for this change.

### [2026-04] QA & System Backtest: Fix Admin Repairs Duplication & Handover Error
F: `src/app/admin/repairs/page.tsx`
W: Fixed an issue where editing a ticket created a duplicate rather than updating. Added the missing `setEditingTicket(ticket)` inside `handleOpenModal`, which correctly sets the context so `handleSubmit` uses `updateDoc` instead of `addDoc`. Also fixed a `ReferenceError: writeBatch is not defined` that occurs during ticket handover by explicitly importing `writeBatch` và `increment` từ `firebase/firestore`. Cập nhật giao diện `admin/repairs` để hiển thị đúng `productName` trong modal Bàn Giao và bổ sung hiển thị danh sách linh kiện trong modal Chi tiết phiếu (Eye icon).
Y: Resolves UI/Backend bugs that interrupt the core workflow for Admins managing Repair Tickets. Ensure accurate visual tracking of used parts.
N: No new files or deps. `npm run graph` not needed for this change.

### [2026-04] QA & System Backtest: Fix Warranty Stamping & Ticket Creation
F: `src/lib/warrantyUtils.ts`, `src/app/admin/repairs/page.tsx`
W: Fixed the bug where the system failed to stamp `warrantyExpiresAt` during Handover and failed to display parts in the Warranty Creation Modal. The root cause was that parts were hardcoded to require `status === 'selected'`, which broke when the Phase 4 inventory overhaul introduced varied statuses (`in_stock`, `approved`). Updated filtering logic to allow all parts except `['rejected', 'cancelled']`.
Y: Restore Warranty functionalities following changes introduced by the Inventory Overhaul.
N: No new files or deps. `npm run graph` not needed for this change.

### [2026-04] Dev-Tool: Tích hợp Ollama AI vào File Dependency Graph
F: `dev-tools/file-graph/serve.js` (rewrite), `dev-tools/file-graph/index.html` (rewrite), `scripts/generate-graph.js` (minor update)
W: Tích hợp AI local (Ollama) vào standalone dev-tool trên port 3333. Thêm 4 tính năng: (1) AI Phân tích file — đọc code + dependency, tóm tắt chức năng/exports, (2) AI Impact Analysis — giải thích ảnh hưởng khi sửa file, (3) Health Check — phân tích kiến trúc toàn bộ dự án, (4) Chat tự do — hỏi AI bất kỳ về codebase. serve.js thêm 4 endpoint proxy đến Ollama (/api/ai/status, /api/ai/models, /api/ai, /api/ai/read-file). UI có tab Graph + AI, model selector dynamic từ Ollama `/api/tags`, streaming response với markdown rendering. generate-graph.js thêm line count vào JSON output.
Y: User muốn tận dụng Ollama local để hỗ trợ phân tích code, giải thích dependency impact, health-check kiến trúc — tất cả offline, zero cloud cost.
N: Hoàn toàn tách biệt khỏi Next.js project — không dùng gì từ `src/`. Zero npm deps mới. Model không cố định — dropdown hiển thị tất cả model có trên máy từ Ollama. Chạy `ollama serve` trước khi dùng AI features.

### [2026-04] Dev-Tool: Thêm lịch sử chat AI persistent
F: `dev-tools/file-graph/serve.js`, `dev-tools/file-graph/index.html`
W: Thêm hệ thống lưu lịch sử chat AI. Backend: 4 endpoint mới (GET/POST/DELETE /api/ai/history) lưu session dạng JSON file trong `dev-tools/file-graph/chat-history/`. Frontend: history bar (nút "＋ Chat mới" + "📜 Lịch sử"), history drawer hiển thị danh sách session cũ (title + ngày + số tin nhắn), click để restore, nút ✕ để xoá. Auto-save sau mỗi tin nhắn AI hoàn thành.
Y: Chat trước đó bị mất khi refresh trang — user yêu cầu có lịch sử persistent.
N: Zero deps mới. Data lưu local trong `chat-history/` (nên gitignore thư mục này).

### [2026-04] Security Hardening + Dead Code Cleanup
F: `src/app/api/ai/route.ts`, `src/app/api/admin/ai/route.ts`, `src/lib/firestore.ts` [DELETED]
W: (1) Thêm rate limiting 5 req/min/IP vào `/api/ai/route.ts` — bảo vệ Gemini API credits khỏi bị spam. Dùng pattern in-memory Map giống `/api/search` và `/api/checkout`. (2) Thêm `requireAdmin(request)` + rate limiting 5 req/min/IP vào `/api/admin/ai/route.ts` — chỉ admin đã đăng nhập mới được dùng AI content generation. Import `requireAdmin` từ `@/lib/apiAuth.ts` (module đã tồn tại, dùng trong `seed-config`). (3) Xóa `src/lib/firestore.ts` (333 dòng dead code) — file không được import ở bất kỳ đâu, đã bị thay thế hoàn toàn bởi `useFirestore.ts`.
Y: Phát hiện từ báo cáo kiến trúc (implementation_plan.md): 2 lỗ hổng bảo mật P0 và 1 file dead code P1.
N: `npm run build` thành công. `npm run graph` cần chạy do xóa file. `imageLoader.ts` được xác nhận KHÔNG phải dead code (dùng bởi next.config.ts L524). `subscribeNewsletter()` giữ lại theo yêu cầu user.
