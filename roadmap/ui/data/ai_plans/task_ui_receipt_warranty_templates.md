# Task: Cấu hình Mẫu Biên Nhận Bảo Hành (Thiết bị, Sửa chữa, Phụ kiện)

- ID: plan-ui-receipt-warranty-templates
- Date: 03.06.2026
- Status: in-progress

## Scope
- `src/app/admin/settings/receipt/page.tsx`

## Checklist

1. [x] Cập nhật interface `ReceiptConfig` trong file `src/app/admin/settings/receipt/page.tsx`
2. [x] Thêm 3 tab mới cho 3 mẫu bảo hành vào giao diện trang Cài Đặt Biên Nhận
3. [x] Tạo các component `WarrantyConfigForm` và `WarrantyPreview` tái sử dụng
4. [x] Thiết lập dữ liệu mock ban đầu (default config) giống với 3 hình mẫu cung cấp
5. [x] Kiểm tra hiển thị Live Preview
6. [x] Đảm bảo tính năng lưu hoạt động bình thường, ghi đè vào Firestore `system_config/receipt`
