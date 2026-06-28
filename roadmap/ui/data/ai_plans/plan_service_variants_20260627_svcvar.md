# Plan: Service Variants For Customer Detail Pages

## Goal

Cho phép trang khách `/service/[id]` hiển thị các dịch vụ cùng taxonomy danh mục như biến thể, tương tự cách storefront đang gom biến thể sản phẩm theo danh mục.

## Scope

- Không thêm metadata nhóm biến thể riêng cho `services`.
- Dùng deepest `categoryIds` của dịch vụ hiện tại làm khóa gom biến thể.
- Thêm query server `fetchServiceVariants(categoryId, excludeId)`.
- Render selector biến thể trong `ServiceDetailClient` ở cột phải phía trên form đặt lịch.
- Đổi chọn ngày đặt lịch từ dropdown 7 ngày sang calendar tháng có điều hướng.

## Guardrails

- Không đổi giá, appointment, repair workflow, tồn kho hoặc voucher.
- Chỉ hiển thị dịch vụ `isActive == true` cùng taxonomy danh mục.
- Không cần migration; dịch vụ cũ đã có `categoryIds` sẽ tự tham gia nhóm.
- Không đổi payload appointment; trường `date` vẫn gửi định dạng `YYYY-MM-DD`.
