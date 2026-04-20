# 📂 FILE DEPENDENCIES MAP (AST Parsed)

> **Auto-generated** by Tool using `ts-morph`
> **Files**: 128 | **Import links**: 306

---

## ⚠️ CIRCULAR DEPENDENCIES DETECTED

*Lưu ý: Các file này đang import chéo lẫn nhau, có thể gây lỗi runtime hoặc khó maintain.*

- `src/app/(customer)/page.tsx` 🔄 `src/app/(customer)/page.client.tsx`

---

## 🎯 IMPACT SUMMARY — Top 20 Most-Imported Files

| # | File | Category | Direct Importers | Transitive Impact | Exported Symbols |
|---|------|----------|-----------------|-------------------|------------------|
| 1 | `src/lib/firebase.ts` | lib | 42 | 66 | db, rtdb, auth, storage, default |
| 2 | `src/lib/types.ts` | lib | 28 | 37 | User, FirestoreTimestamp, FirestoreWriteTimestamp,... |
| 3 | `src/lib/constants.ts` | lib | 27 | 30 | SITE_URL, RETAIL_CATEGORIES, RetailCategory |
| 4 | `src/lib/ConfigContext.tsx` | lib | 23 | 27 | ConfigProvider, ServerConfigProvider, useConfig, H... |
| 5 | `src/lib/AuthContext.tsx` | lib | 16 | 19 | AuthProvider, useAuth, AppUser |
| 6 | `src/lib/toast.ts` | lib | 16 | 16 | toastSuccess, toastError, toastWarning |
| 7 | `src/lib/firebaseAdmin.ts` | lib | 13 | 21 | isAdminAvailable, getAdminApp, getAdminAuth, getAd... |
| 8 | `src/lib/useClientPagination.ts` | hook | 13 | 15 | useClientPagination, PAGE_SIZE_OPTIONS, PageSize |
| 9 | `src/components/admin/Modal.tsx` | component | 13 | 14 | default |
| 10 | `src/components/admin/PaginationBar.tsx` | component | 12 | 14 | default |
| 11 | `src/lib/CartContext.tsx` | lib | 7 | 9 | CartProvider, useCart, CartItem |
| 12 | `src/lib/storage.ts` | lib | 6 | 13 | uploadMedia, uploadImage, uploadMultipleImages, de... |
| 13 | `src/app/(customer)/_lib/server-queries.ts` | lib | 6 | 6 | revalidate, fetchCategoryItems, fetchArticles, fet... |
| 14 | `src/lib/revalidate.ts` | lib | 5 | 34 | triggerRevalidate |
| 15 | `src/lib/useFirestore.ts` | hook | 5 | 9 | useFirestoreCollection, useProducts, useFlashSaleP... |
| 16 | `src/components/admin/MediaManager.tsx` | component | 5 | 9 | default, MediaItem, MEDIA_FOLDERS |
| 17 | `src/lib/workflowFeatures.ts` | lib | 4 | 4 | hasFeature, getActiveFeatures, isChecklistComplete... |
| 18 | `src/components/admin/UniversalProductModal.tsx` | component | 4 | 4 | default |
| 19 | `src/components/home/ServiceCard.tsx` | component | 4 | 6 | default |
| 20 | `src/components/VideoEmbed.tsx` | component | 3 | 5 | default |
