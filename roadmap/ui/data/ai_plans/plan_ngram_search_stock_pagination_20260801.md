# Plan Nâng cấp Tìm kiếm N-grams & Phân trang Tổng Tồn Kho (01/08/2026)

## 🎯 Mục tiêu
- Nâng cấp tính năng tìm kiếm N-grams đa từ (Bigrams & Trigrams) trên các trang quản trị (`admin/products`, `admin/parts`, `admin/services`, `admin/inventory/stock`).
- Chuẩn hóa nút bấm **"Tìm" / "Tìm kiếm"** độc lập, không tự động kích hoạt truy vấn khi gõ phím.
- Phân định rõ ranh giới Sản phẩm Bán lẻ (21 SP) và Linh kiện (1,212 SP).
- Nâng cấp trang `admin/inventory/stock` sang cơ chế Phân trang chuẩn (`useFirestorePaginated` - 20 SP/trang) và tích hợp Server Aggregate Stats API `/api/inventory/stats`.

## 📁 Scope
- `src/app/admin/products/page.tsx`
- `src/app/admin/parts/page.tsx`
- `src/app/admin/services/page.tsx`
- `src/app/admin/inventory/stock/page.tsx`
- `src/app/api/inventory/stats/route.ts`
- `src/lib/utils.ts`
- `scripts/backfill-catalog-search-index.mjs`

## 💡 Key Decisions
1. **Nút tìm kiếm độc lập**: Không tự động gửi query Firestore khi `onChange` gõ phím; chỉ submit khi bấm nút **Tìm** hoặc ấn `Enter`.
2. **Loại trừ Linh kiện khỏi Sản phẩm Bán lẻ**: `admin/products` luôn gắn điều kiện `category not-in PART_CATEGORY_VALUES` để đảm bảo tổng số sản phẩm luôn đúng 21 SP.
3. **Mở rộng N-grams Bigrams & Trigrams**: CSDL Firestore được backfill toàn bộ mảng `searchKeywords` ghép từ cho 2,141+ sản phẩm và 530 dịch vụ.
4. **Phân trang Bounded Cursor Kho**: Trang `admin/inventory/stock` dùng `useFirestorePaginated` (20 SP/trang), kết hợp Server API `/api/inventory/stats` để tính toán chính xác 100% tài sản kho và hàng tạm giữ.
