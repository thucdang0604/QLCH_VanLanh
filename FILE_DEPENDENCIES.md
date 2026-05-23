# 📂 FILE DEPENDENCIES MAP (AST Parsed)

> **Auto-generated** by Tool using `ts-morph`
> **Files**: 196 | **Import links**: 498

---

## ⚠️ CIRCULAR DEPENDENCIES DETECTED

*Lưu ý: Các file này đang import chéo lẫn nhau, có thể gây lỗi runtime hoặc khó maintain.*

- `src/app/(customer)/page.tsx` 🔄 `src/app/(customer)/page.client.tsx`

---

## 🎯 IMPACT SUMMARY — Top 20 Most-Imported Files

| # | File | Category | Direct Importers | Transitive Impact | Exported Symbols |
|---|------|----------|-----------------|-------------------|------------------|
| 1 | `src/lib/firebase.ts` | lib | 43 | 71 | getAuthInstance, getRtdbInstance, getStorageInstan... |
| 2 | `src/lib/types.ts` | lib | 32 | 42 | User, FirestoreTimestamp, FirestoreWriteTimestamp,... |
| 3 | `src/lib/ConfigContext.tsx` | lib | 29 | 35 | ConfigProvider, ServerConfigProvider, useConfig, H... |
| 4 | `src/lib/constants.ts` | lib | 25 | 28 | SITE_URL, RETAIL_CATEGORIES, RetailCategory |
| 5 | `src/lib/AuthContext.tsx` | lib | 17 | 20 | AuthProvider, useAuth, AppUser |
| 6 | `src/lib/firebaseAdmin.ts` | lib | 17 | 26 | isAdminAvailable, getAdminApp, getAdminAuth, getAd... |
| 7 | `src/lib/toast.ts` | lib | 17 | 18 | toastSuccess, toastError, toastWarning |
| 8 | `DATA_STORE::products` | data_store | 15 | 21 | - |
| 9 | `src/lib/useClientPagination.ts` | hook | 13 | 15 | useClientPagination, PAGE_SIZE_OPTIONS, PageSize |
| 10 | `src/components/admin/Modal.tsx` | component | 13 | 15 | default |
| 11 | `src/components/admin/PaginationBar.tsx` | component | 12 | 14 | default |
| 12 | `DATA_STORE::system_config` | data_store | 10 | 41 | - |
| 13 | `src/components/admin/MediaManager.tsx` | component | 8 | 12 | default, MediaItem, MEDIA_FOLDERS |
| 14 | `src/app/(customer)/_lib/server-queries.ts` | other | 8 | 8 | SerializedDoc, revalidate, fetchDynamicCategories,... |
| 15 | `src/lib/CartContext.tsx` | lib | 7 | 9 | CartProvider, useCart, CartItem |
| 16 | `src/lib/config-defaults.ts` | lib | 7 | 37 | HeroBanner, BackgroundConfig, StoreBranch, Section... |
| 17 | `DATA_STORE::orders` | data_store | 7 | 9 | - |
| 18 | `DATA_STORE::repairs` | data_store | 7 | 9 | - |
| 19 | `DATA_STORE::inventory_logs` | data_store | 7 | 7 | - |
| 20 | `DATA_STORE::users` | data_store | 6 | 22 | - |
