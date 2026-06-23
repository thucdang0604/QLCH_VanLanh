# Kế Hoạch Triển Khai: Cập Nhật Workflows với Các Edge Cases và POS làm Trung Tâm

**Ngày thực hiện:** 2026-06-17
**Trạng thái:** In Progress

## Tóm tắt nội dung:
Dựa trên phản hồi, chúng ta sẽ bỏ qua luồng "Bên thứ 3" và "Khách bỏ máy", đồng thời tái cấu trúc lại sơ đồ Repair và POS sao cho phiếu sửa chữa được đẩy thẳng ra POS thanh toán chung với các chiết khấu, sản phẩm mua kèm. Bên cạnh đó, bổ sung thêm các ngách cho kho hàng và tài chính.

## 1. Module Sửa chữa (`repair.md`)
- Loại bỏ quá trình "Thanh toán phiếu sửa chữa" khỏi nội bộ Repair Workflow.
- Bước cuối cùng là "Bàn giao thiết bị" -> "Tạo Order Checkout tại POS".
- Bổ sung luồng "Khách quay lại bảo hành sửa chữa" (Warranty Claim) từ "Nhận máy".

## 2. Module POS & Đơn hàng (`pos-orders.md`)
- Sửa đổi sơ đồ POS trở thành trung tâm thu tiền (Payment Hub).
- Input đầu vào của POS: "Giỏ hàng bán lẻ" hoặc "Mã phiếu sửa chữa".
- Bổ sung khối "Tính toán giảm giá đa tầng" (VIP / Voucher / Mua kèm phụ kiện).
- Bổ sung Edge Cases: Trả hàng / Hoàn tiền, Giao hàng thất bại (Bùng đơn COD), Khách hủy đơn đặt cọc.

## 3. Module Kho hàng (`inventory.md`)
- Bổ sung nhánh "Trả hàng Nhà cung cấp" khi hàng hóa bị lỗi.
- Bổ sung nhánh "Kiểm kê định kỳ & Xử lý hao hụt kho" (tăng/giảm kho bất thường).

## 4. Module Tài chính (`finance-hr.md`)
- Cập nhật dòng tiền POS đổ về Finance.
- Bổ sung nhánh "Xử lý công nợ (Thanh toán nợ Pay Later nhiều lần)".
- Bổ sung "Hạch toán trừ hoa hồng KTV" khi đơn hàng bị bùng hoặc linh kiện hỏng do kỹ thuật.
