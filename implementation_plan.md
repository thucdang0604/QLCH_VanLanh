# Báo cáo Đánh giá Sức khỏe Kiến trúc — QLCH_VanLanh

Cross-reference giữa phân tích Sub-AI (129 files) và kiểm tra mã nguồn thực tế.

## Tổng quan phân tích

| Chỉ số | Giá trị |
|---|---|
| Tổng files phân tích | 129 |
| Files lib/service | 22 |
| Files component | 18 |
| Files page (admin) | 18 |
| Files page (customer) | 17 |
| Files API route | 7 |
| Circular dependencies | 1 (type-only, LOW) |
| Dead code files | **1 confirmed** (firestore.ts) |
| Security concerns | 2 (HIGH) |
| Architecture smells | 3 (MEDIUM) |

---

## Phát hiện #1: Dead Code — `firestore.ts` ☠️

> [!CAUTION]
> **333 dòng code hoàn toàn không được sử dụng** — không có file nào import `@/lib/firestore`.

### Bằng chứng
- Sub-AI `impactScore: 0`, `importedBy: []`
- `grep -r "from '@/lib/firestore'" src/` → **0 kết quả**
- File exports 18 hàm CRUD (getProducts, createProduct, deleteProduct, ...)
- Các hàm này đã được **thay thế hoàn toàn** bởi `useFirestore.ts` (hooks + CRUD)

### ✅ Xác thực thực tế: CHÍNH XÁC
- **Xác nhận: DEAD CODE** — An toàn để xóa
- Plan.md đã ghi rõ: *"Admin: useFirestore(collectionName)"* và *"Customer: RSC + server-queries.ts"*
- File `types.ts` được import bởi `firestore.ts` nhưng types vẫn được dùng ở nơi khác → `types.ts` KHÔNG phải dead code

### Hành động đề xuất
```diff
- DELETE src/lib/firestore.ts (333 lines)
```
**Rủi ro: THẤP** — Không file nào depend vào nó.

---

## Phát hiện #2: ~~Dead Code~~ — `imageLoader.ts` ✅ ĐANG SỬ DỤNG

> [!WARNING]
> **BÁO CÁO GỐC SAI** — File `imageLoader.ts` KHÔNG phải dead code.

### Bằng chứng gốc (sai)
- `grep -r "from '@/lib/imageLoader'" src/` → **0 kết quả** (đúng nhưng không đủ)
- Sub-AI `importedBy: []` (đúng nhưng không đủ)

### ✅ Xác thực thực tế: **KHÔNG PHẢI DEAD CODE**
- File được reference bởi `next.config.ts` dòng 524: `loaderFile: './src/lib/imageLoader.ts'`
- Next.js sử dụng **string path config** chứ không phải ES import → grep không tìm ra
- File 31 dòng, implement custom image loader cho Firebase Storage + Google CDN
- **XÓA FILE NÀY SẼ BREAK TOÀN BỘ `<Image>` COMPONENT TRÊN SITE**

### Hành động đề xuất
```diff
  KEEP src/lib/imageLoader.ts — Active, config-referenced
```
**Rủi ro nếu xóa: CỰC CAO** — Toàn bộ ảnh trên site sẽ bị lỗi.

---

## Phát hiện #3: Circular Dependency — `page.tsx` ↔ `page.client.tsx` 🔄

> [!NOTE]
> Đây là circular dependency nhưng **KHÔNG phải lỗi thực tế**.

### Bằng chứng
- `page.tsx` L1: `import ClientPage from './page.client'` (runtime import)
- `page.client.tsx` L12: `import type { SSRHomeConfig } from './page'` (**type-only import**)

### ✅ Xác thực thực tế: CHÍNH XÁC
- **FALSE ALARM** — TypeScript `import type` bị xóa hoàn toàn lúc compile, không tạo runtime circular dependency
- Đã xác nhận qua code: `page.client.tsx` L12 đúng là `import type { SSRHomeConfig } from './page'`
- Đây là pattern chuẩn của Next.js 15: Server Component exports type → Client Component consume
- **Không cần sửa**

---

## Phát hiện #4: Security — AI Route không có Authentication 🔴

> [!CAUTION]
> `/api/ai/route.ts` — Endpoint công khai, không có auth, không có rate limiting. Bất kỳ ai cũng có thể gọi và tiêu tốn Gemini API credits.

### Bằng chứng (trích từ source)
```typescript
// src/app/api/ai/route.ts — Line 13
export async function POST(request: NextRequest) {
    // ❌ Không có verifyUser() hoặc requireAdmin()
    // ❌ Không có rate limiting
    const { prompt, context, history } = await request.json();
    // ... gọi chatWithGemini trực tiếp
}
```

### So sánh với API routes khác
| Route | Auth | Rate Limit | Honeypot |
|---|---|---|---|
| `/api/checkout` | ❌ | ✅ 3/min | ✅ |
| `/api/reviews` | ❌ | ✅ 3/min + 3/day | ✅ |
| `/api/ai` | ❌ | ❌ | ❌ |
| `/api/admin/ai` | ❌ | ❌ | ❌ |

### ✅ Xác thực thực tế: CHÍNH XÁC
- Đã xem toàn bộ file (104 dòng) — không có bất kỳ auth hay rate limit nào
- **Lỗ hổng nghiêm trọng**: Bot/script có thể gọi vô hạn, tiêu tốn Gemini API credits

### Hành động đề xuất
Thêm rate limiting vào `/api/ai/route.ts` (tương tự pattern của checkout):

```typescript
// Thêm rate limit: 10 req/min/IP cho chatbot khách hàng
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;
```

**Rủi ro nếu KHÔNG sửa: CAO** — Bot có thể spam endpoint, tốn credit Gemini không giới hạn.

---

## Phát hiện #5: Security — Admin AI Route không có Auth 🔴

> [!CAUTION]
> `/api/admin/ai/route.ts` — Route dành cho admin nhưng không xác thực user.

### Bằng chứng
- File 532 dòng — sử dụng Ollama (local) thay vì Gemini → rủi ro chi phí thấp hơn
- Nhưng vẫn không nên để endpoint mở — bất kỳ ai cũng có thể trigger content generation

### ✅ Xác thực thực tế: CHÍNH XÁC
- Đã xem toàn bộ file (532 dòng) — không có bất kỳ auth check nào
- Module `requireAdmin` từ `@/lib/apiAuth.ts` **đã tồn tại** (đang dùng trong `/api/seed-config/route.ts`)
- Chỉ cần import và sử dụng — không cần tạo mới

### Hành động đề xuất
- Thêm `requireAdmin(request)` từ `@/lib/apiAuth.ts` (module đã có sẵn, chỉ 1 dòng import + 1 dòng call)
- Hoặc ít nhất thêm rate limiting

---

## Phát hiện #6: Architecture — Duplicate CRUD Logic ⚠️

> [!IMPORTANT]
> Hai file cùng implement Firestore CRUD nhưng theo 2 cách khác nhau.

| File | Lines | Approach | Used by |
|---|---|---|---|
| `firestore.ts` | 333 | Function-based, one-shot | **NOBODY** (0 imports) |
| `useFirestore.ts` | 282 | Hook-based, real-time | 5 files (xem bên dưới) |

### ✅ Xác thực thực tế: CHÍNH XÁC (với điều chỉnh số liệu)
- `useFirestore.ts` thực tế được import bởi **5 files** (không phải "5 admin pages + 2 components" như ban đầu):
  - `admin/services/page.tsx` — useFirestoreCollection, addDocument, updateDocument, deleteDocument
  - `admin/products/page.tsx` — useFirestoreCollection, deleteDocument
  - `admin/parts/page.tsx` — useFirestoreCollection, updateDocument, deleteDocument
  - `components/admin/UniversalProductModal.tsx` — addDocumentWithId, updateDocument
  - `components/home/ArticleBlock.tsx` — useFirestoreCollection
- `firestore.ts` là phiên bản cũ, đã bị thay thế hoàn toàn
- **Giải pháp: Xóa `firestore.ts`** (đã cover ở Phát hiện #1)

---

## Phát hiện #7: Architecture — `useFirestore.ts` trộn hooks và utility functions ⚠️

> [!NOTE]
> File `useFirestore.ts` chứa cả React hooks VÀ standalone CRUD functions — vi phạm Single Responsibility.

### Chi tiết
- **Hooks** (cần React context): `useFirestoreCollection`, `useProducts`, `useFlashSaleProducts`, `useServices`, `useArticles`, `useOrders`
- **Standalone functions** (không cần React): `addDocument`, `addDocumentWithId`, `updateDocument`, `deleteDocument`, `subscribeNewsletter`

### ✅ Xác thực thực tế: CHÍNH XÁC
- Đã xem toàn bộ file (282 dòng) — đúng 282 dòng như plan nêu
- File đang chứa `'use client'` directive dù có 5 standalone functions không cần React
- **Phát hiện thêm**: `subscribeNewsletter()` (L260-281) **không được import ở bất kỳ đâu** — dead code tiềm ẩn
- Mức độ nghiêm trọng: **THẤP**
- Refactor có thể tách thành `useFirestore.ts` (hooks only) + `firestoreActions.ts` (CRUD)
- **Khuyến nghị: Không ưu tiên** — chỉ refactor khi file phát triển thêm

---

## Phát hiện #8: Sub-AI Tool — Graph thiếu transitive imports từ leaf pages

> [!NOTE]
> Sub-AI tool hiển thị `importedBy: []` cho nhiều lib files (`toast.ts`, `useFirestore.ts`, `commissionUtils.ts`...) mặc dù chúng được sử dụng rộng rãi.

### ✅ Xác thực thực tế: CHÍNH XÁC
- `toast.ts` thực tế được import bởi **16 files** (đã kiểm chứng bằng grep):
  - 14 admin pages + 1 admin component + 1 admin layout
- `useFirestore.ts` được import bởi **5 files** (đã liệt kê ở #6)
- Graph analyzer cần cải thiện logic tracking "used by" cho leaf nodes

### Nguyên nhân
- Admin pages là **leaf nodes** (không export cho ai cả) → graph analyzer không track chúng như "importers"

### Hành động đề xuất
- Cải thiện `GraphAnalyzerService.ts` để track "used by" kể cả leaf nodes
- Bổ sung metric "directImporters" riêng biệt với "transitiveImporters"

---

## Tóm tắt hành động — Ưu tiên

| # | Hành động | Mức ưu tiên | Rủi ro | Effort | Trạng thái xác thực |
|---|---|---|---|---|---|
| 1 | 🔴 Thêm rate limit vào `/api/ai` | **P0 — Critical** | Tốn $ nếu bị spam | 15 phút | ✅ Xác nhận |
| 2 | 🔴 Thêm auth/rate limit vào `/api/admin/ai` | **P0 — Critical** | Expose admin AI | 15 phút | ✅ Xác nhận (`requireAdmin` đã có sẵn) |
| 3 | ☠️ Xóa `firestore.ts` (dead code) | **P1 — High** | Zero risk | 1 phút | ✅ Xác nhận (0 imports) |
| 4 | ~~❓ Kiểm tra `imageLoader.ts`~~ | ~~P1~~ → **Đã đóng** | — | — | ❌ KHÔNG XÓA — đang dùng bởi next.config.ts L524 |
| 5 | ⚠️ Tách `useFirestore.ts` (SRP) | **P3 — Low** | Refactor risk | 30 phút | ✅ Xác nhận |
| 6 | 🔧 Cải thiện Sub-AI graph (leaf tracking) | **P2 — Medium** | Tool improvement | 1-2 giờ | ✅ Xác nhận (toast.ts: 16 importers, graph: 0) |

## Open Questions

1. ~~**`imageLoader.ts`**: Cần kiểm tra `next.config.ts`~~ → **ĐÃ XÁC NHẬN: ĐANG SỬ DỤNG, KHÔNG XÓA**
2. **Rate limiting `/api/ai`**: Bạn muốn giới hạn bao nhiêu request/phút? Đề xuất: 10/min cho customer chatbot, 30/min cho admin AI.
3. **Có muốn tôi thực hiện ngay P0 + P1** (thêm rate limit + xóa dead code)?

## Verification Plan

### Automated Tests
- `grep -r "from '@/lib/firestore'" src/` → xác nhận 0 import trước khi xóa ✅ Đã chạy
- `npm run build` → xác nhận build thành công sau khi xóa
- Test `/api/ai` với > 10 requests/phút → xác nhận bị block

### Manual Verification  
- Truy cập ChatWidget → gửi tin nhắn → xác nhận AI vẫn phản hồi
- Truy cập Admin pages → xác nhận CRUD operations vẫn hoạt động
