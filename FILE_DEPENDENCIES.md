# 📂 FILE DEPENDENCIES MAP (AST Parsed)

> **Auto-generated** by Tool using `ts-morph`
> **Files**: 139 | **Import links**: 342

---

## ⚠️ CIRCULAR DEPENDENCIES DETECTED

*Lưu ý: Các file này đang import chéo lẫn nhau, có thể gây lỗi runtime hoặc khó maintain.*

- `src/app/(customer)/page.tsx` 🔄 `src/app/(customer)/page.client.tsx`

---

## 🎯 IMPACT SUMMARY — Top 20 Most-Imported Files

| # | File | Category | Direct Importers | Transitive Impact | Exported Symbols |
|---|------|----------|-----------------|-------------------|------------------|
| 1 | `src/lib/firebase.ts` | lib | 44 | 72 | getAuthInstance, getRtdbInstance, getStorageInstan... |
| 2 | `src/lib/types.ts` | lib | 30 | 40 | User, FirestoreTimestamp, FirestoreWriteTimestamp,... |
| 3 | `src/lib/ConfigContext.tsx` | lib | 29 | 36 | ConfigProvider, ServerConfigProvider, useConfig, H... |
| 4 | `src/lib/constants.ts` | lib | 25 | 28 | SITE_URL, RETAIL_CATEGORIES, RetailCategory |
| 5 | `src/lib/toast.ts` | lib | 17 | 18 | toastSuccess, toastError, toastWarning |
| 6 | `src/lib/AuthContext.tsx` | lib | 16 | 19 | AuthProvider, useAuth, AppUser |
| 7 | `src/lib/firebaseAdmin.ts` | lib | 15 | 24 | isAdminAvailable, getAdminApp, getAdminAuth, getAd... |
| 8 | `src/components/admin/Modal.tsx` | component | 14 | 16 | default |
| 9 | `src/lib/useClientPagination.ts` | hook | 13 | 15 | useClientPagination, PAGE_SIZE_OPTIONS, PageSize |
| 10 | `src/components/admin/PaginationBar.tsx` | component | 12 | 14 | default |
| 11 | `src/app/(customer)/_lib/server-queries.ts` | other | 8 | 8 | revalidate, fetchDynamicCategories, fetchTaxonomyC... |
| 12 | `src/lib/CartContext.tsx` | lib | 7 | 9 | CartProvider, useCart, CartItem |
| 13 | `src/lib/config-defaults.ts` | lib | 7 | 38 | HeroBanner, BackgroundConfig, StoreBranch, Section... |
| 14 | `src/lib/utils.ts` | lib | 7 | 10 | generateSlug, getCategoryPath, collectAllNodeIds |
| 15 | `src/components/admin/MediaManager.tsx` | component | 7 | 12 | default, MediaItem, MEDIA_FOLDERS |
| 16 | `src/lib/storage.ts` | lib | 6 | 16 | uploadMedia, uploadImage, uploadMultipleImages, de... |
| 17 | `src/lib/revalidate.ts` | lib | 5 | 38 | triggerRevalidate |
| 18 | `src/lib/useFirestore.ts` | hook | 5 | 8 | useFirestoreCollection, useProducts, useFlashSaleP... |
| 19 | `src/lib/workflowFeatures.ts` | lib | 4 | 4 | hasFeature, getActiveFeatures, isChecklistComplete... |
| 20 | `src/components/admin/CategoryTaxonomySelector.tsx` | component | 4 | 7 | default |
