# 7 Tính Năng Mở Rộng — QLCH VanLanh

> **Ngày lập:** 19.05.2026 | **Trạng thái:** IN PROGRESS

## Tổng Quan

Bổ sung 7 module mới vào hệ thống QLCH VanLanh:

| # | Tính năng | Mô tả ngắn |
|---|-----------|-------------|
| 1 | Import Excel | Nhập sản phẩm/dịch vụ bằng file Excel, có mẫu template |
| 2 | Quản lý NCC | CRUD nhà cung cấp (tên, SĐT, MST, STK...) |
| 3 | Công nợ NCC | Tự phát sinh nợ khi nhập hàng, ghi nhận thanh toán |
| 4 | Xuất báo cáo Excel | Xuất lịch sử nhập hàng theo khoảng ngày |
| 5 | Chi tiết SP kiểu ĐTV | Biến thể (màu, dung lượng, tình trạng), đánh giá & nhận xét |
| 6 | Discount Rules | Cấu hình giảm giá phụ kiện theo dịch vụ sửa chữa (dynamic) |
| 7 | POS + Phiếu SC | Tra cứu SĐT → chọn phiếu sửa chữa → thanh toán → auto cập nhật |

## Quyết Định Đã Chốt

- **Rule giảm giá:** Dạng đơn giản `IF dịch vụ X → giảm Y% phụ kiện Z` cho phụ kiện cố định
- **POS + Repair:** Thanh toán qua POS → tự động cập nhật status phiếu SC sang "Đã thanh toán"
- **Trang chi tiết SP:** Bổ sung cả nhóm biến thể + phần "Đánh giá & nhận xét"

## Schema Mới

### Firestore Collections
- `suppliers` — Thông tin nhà cung cấp
- `supplier_transactions` — Lịch sử giao dịch NCC (nhập hàng / thanh toán)
- `accessory_discount_rules` — Cấu hình rule giảm giá phụ kiện động

### Product Schema Expansion
- `seriesId` (optional) — nhóm sản phẩm cùng dòng
- `color` (optional) — màu sắc
- `storageCapacity` (optional) — dung lượng
- `condition` (optional) — tình trạng máy

### ImportReceipt Expansion
- `supplierId` (optional) — link tới collection suppliers
- `paymentStatus` (optional) — 'paid' | 'partial' | 'unpaid'
- `paidAmount` (optional) — số tiền đã trả

## Dependency
- Thêm thư viện `xlsx` (SheetJS) cho đọc/ghi Excel

## Files Chính Bị Ảnh Hưởng
- `src/lib/types.ts` — Thêm interfaces mới
- `src/app/admin/suppliers/page.tsx` — [MỚI] Quản lý NCC
- `src/components/admin/ExcelImportModal.tsx` — [MỚI] Import Excel
- `src/components/admin/ExportImportReportButton.tsx` — [MỚI] Xuất báo cáo
- `src/app/admin/settings/discount-rules/page.tsx` — [MỚI] Cấu hình rules
- `src/lib/discountRuleUtils.ts` — [MỚI] Utility tính giảm giá
- `src/app/(customer)/product/[id]/ProductDetailClient.tsx` — Nâng cấp UI
- `src/app/admin/pos/page.tsx` — Tích hợp phiếu SC
- `src/app/admin/parts/page.tsx` — Link NCC + công nợ
