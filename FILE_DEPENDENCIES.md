# 📂 FILE DEPENDENCIES MAP (AST Parsed)

> **Auto-generated** by Tool using `ts-morph`
> **Files**: 248 | **Import links**: 619

---

## ⚠️ CIRCULAR DEPENDENCIES DETECTED

*Lưu ý: Các file này đang import chéo lẫn nhau, có thể gây lỗi runtime hoặc khó maintain.*

- `src/app/(customer)/page.tsx` 🔄 `src/app/(customer)/page.client.tsx`

---

## 🎯 IMPACT SUMMARY — Top 20 Most-Imported Files

| # | File | Category | Direct Importers | Transitive Impact | Exported Symbols |
|---|------|----------|-----------------|-------------------|------------------|
| 1 | `src/lib/firebase.ts` | lib | 55 | 81 | getAuthInstance, getRtdbInstance, getStorageInstan... |
| 2 | `src/lib/types.ts` | lib | 47 | 61 | User, FirestoreTimestamp, FirestoreWriteTimestamp,... |
| 3 | `src/lib/constants.ts` | lib | 33 | 36 | SITE_URL, PART_CATEGORY, PART_CATEGORY_LABEL, RETA... |
| 4 | `src/lib/firebaseAdmin.ts` | lib | 32 | 49 | isAdminAvailable, getAdminApp, getAdminAuth, getAd... |
| 5 | `src/lib/ConfigContext.tsx` | lib | 29 | 34 | ConfigProvider, ServerConfigProvider, useConfig, H... |
| 6 | `src/lib/AuthContext.tsx` | lib | 22 | 28 | AuthProvider, useAuth, AppUser |
| 7 | `src/lib/toast.ts` | lib | 20 | 22 | toastSuccess, toastError, toastWarning |
| 8 | `src/lib/apiAuth.ts` | lib | 18 | 18 | verifyUser, requireAdminOrStaff, requireAdmin, req... |
| 9 | `DATA_STORE::products` | data_store | 14 | 20 | - |
| 10 | `src/lib/useClientPagination.ts` | hook | 14 | 16 | useClientPagination, PAGE_SIZE_OPTIONS, PageSize |
| 11 | `src/components/admin/Modal.tsx` | component | 14 | 18 | default |
| 12 | `DATA_STORE::system_config` | data_store | 13 | 46 | - |
| 13 | `src/components/admin/PaginationBar.tsx` | component | 13 | 15 | default |
| 14 | `DATA_STORE::==` | data_store | 8 | 19 | - |
| 15 | `src/components/admin/CurrencyInput.tsx` | component | 8 | 9 | formatVND, parseVND, default |
| 16 | `src/components/admin/MediaManager.tsx` | component | 8 | 12 | default, MediaItem, MEDIA_FOLDERS |
| 17 | `src/app/(customer)/_lib/server-queries.ts` | other | 8 | 8 | SerializedDoc, revalidate, fetchDynamicCategories,... |
| 18 | `src/lib/CartContext.tsx` | lib | 7 | 9 | CartProvider, useCart, CartItem |
| 19 | `src/lib/config-defaults.ts` | lib | 7 | 36 | HeroBanner, BackgroundConfig, StoreBranch, Section... |
| 20 | `src/lib/rateLimit.ts` | lib | 7 | 7 | isRateLimited |
