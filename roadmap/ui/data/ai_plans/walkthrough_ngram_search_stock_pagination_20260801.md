# Walkthrough: Nâng cấp Tìm kiếm N-grams & Phân trang Tổng Tồn Kho (01/08/2026)

## 📌 Tóm tắt Công việc Hoàn thành

1. **Sửa lỗi Lọc Danh mục & Đếm Tổng số Sản phẩm (`admin/products`)**:
   - Khắc phục lỗi chọn danh mục "Điện thoại" bị tăng lên 1,221 sản phẩm.
   - Gắn điều kiện truy vấn gốc `where('category', 'not-in', PART_CATEGORY_VALUES)` và lọc client-side `p.categoryIds.includes(categoryId)`.
   - Kết quả: "Danh mục chính" = 21, "Điện thoại" = 9, "Phụ kiện" = 10.

2. **Nút Tìm kiếm Độc lập (Explicit Submit Buttons)**:
   - Loại bỏ debounce auto-query trên tất cả các trang quản trị.
   - Bổ sung `<form>` wrapper và nút `<button type="submit">Tìm</button>` hoặc `"Tìm kiếm"`.

3. **Mở rộng N-grams Bigrams & Trigrams & Backfill Firestore**:
   - Cập nhật hàm `generateSearchKeywords` trong `src/lib/utils.ts` để tạo đầy đủ Bigrams và Trigrams.
   - Chạy backfill tạo lại mảng `searchKeywords` cho toàn bộ 2,141+ sản phẩm & linh kiện và 530 dịch vụ trong Firestore CSDL.

4. **Khắc phục lỗi Composite Index & Phân trang Trang Kho (`admin/inventory/stock`)**:
   - Loại bỏ xung đột bộ lọc `not-in` + `array-contains-any` và `orderBy('name')` phía server Firestore.
   - Tạo Server API `GET /api/inventory/stats` tính toán chính xác 100% các thẻ KPI tài sản kho.
   - Chuyển `admin/inventory/stock` sang dùng `useFirestorePaginated` (20 SP/trang) với thanh `PaginationBar` tiêu chuẩn.

---

## 🧪 Kết quả Kiểm thử & Xác minh

- **TypeScript Typecheck**: `pnpm typecheck` PASSED (0 errors).
- **Full Verification**: `pnpm verify` PASSED (0 errors).
- **Browser Sub-agent E2E Test**: Đã test tự động trên trình duyệt Chrome headless:
  - 6 thẻ KPI trang Kho hiển thị đúng: Mẫu SP = 2,141, Tạm giữ = 6, Khả dụng = 533, Giá trị tồn kho = 593,531,000đ.
  - Tìm kiếm N-grams đa từ `"iphone 16"` lọc chính xác 96 linh kiện iPhone 16.
  - Chuyển đổi 3 Tab (Tất cả, Bán lẻ, Linh kiện) mượt mà, 0 lỗi console/index.
