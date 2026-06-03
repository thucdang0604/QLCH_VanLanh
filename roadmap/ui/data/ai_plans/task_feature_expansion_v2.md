# Task Tracker — 7 Tính Năng Mở Rộng

> **Cập nhật lần cuối:** 19.05.2026

## Phase 1: Foundation (Types + xlsx)
- [x] Cài đặt thư viện `xlsx`
- [x] Thêm interfaces: Supplier, SupplierTransaction, AccessoryDiscountRule vào types.ts
- [x] Thêm variant fields vào Product interface (seriesId, color, storageCapacity, condition)
- [x] Thêm supplier fields vào ImportReceipt interface

## Phase 2: Quản Lý NCC
- [x] Tạo trang admin/suppliers/page.tsx (CRUD NCC)
- [x] Thêm menu "Nhà cung cấp" vào sidebar admin

## Phase 3: Import Excel
- [x] Tạo ExcelImportModal.tsx (upload, parse, preview, validate, import)
- [x] Tạo Excel template generator (products + services)
- [x] Tích hợp nút Import vào products/page.tsx
- [x] Tích hợp nút Import vào services/page.tsx

## Phase 4: Nhập Hàng + Công Nợ
- [x] Cập nhật parts/page.tsx — dropdown chọn NCC
- [x] Tạo SupplierTransaction khi hoàn tất nhập hàng
- [x] Cập nhật totalDebt trên supplier

## Phase 5: Xuất Báo Cáo Excel
- [x] Tạo ExportImportReportButton.tsx
- [x] Tích hợp vào parts/page.tsx

## Phase 6: Chi Tiết SP + Đánh Giá
- [x] Cập nhật ProductDetailClient.tsx — hiển thị biến thể (kèm hiển thị dịch vụ & phụ kiện gợi ý)
- [x] Thêm section "Đánh giá & nhận xét" (đã tách component và dời xuống dưới cùng)
- [x] Cập nhật server page.tsx — fetch sản phẩm cùng seriesId và fetchRelatedItems
- [x] Quản lý nhóm biến thể (ProductSeriesManager) tích hợp trực tiếp vào Tab ở admin/products

## Phase 7: Discount Rules Engine
- [x] Tạo settings/discount-rules/page.tsx (đã tích hợp logic Hạng khách hàng & Rule giảm giá phụ kiện)
- [x] Tạo discountRuleUtils.ts (đã có lib/discountCalc.ts & lib/discountRuleUtils.ts)

## Phase 8: POS + Phiếu Sửa Chữa
- [x] Thêm lookup SĐT khách → hiển thị phiếu SC
- [x] Chọn phiếu SC → thêm vào giỏ POS (Dưới dạng một sản phẩm ảo, tiền sửa chữa + linh kiện)
- [x] Auto-apply discount rules (Giảm giá tự động phụ kiện đi kèm theo luật cấu hình)
- [x] Thanh toán → auto cập nhật status phiếu SC (Khi POS checkout, chuyển status phiếu sửa chữa sang đã giao khách và thanh toán)
