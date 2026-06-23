# Walkthrough: Cập nhật Workflow Sửa chữa & Logic Tính Giá (Tránh lỗi Bill 0đ)

## Tổng quan
Kế hoạch này giải quyết triệt để vấn đề phiếu sửa chữa hiển thị 0đ khi khách hàng chỉ sử dụng dịch vụ sửa chữa (tiền công) mà không thay thế linh kiện (tiền linh kiện). 
Hệ thống đã được nâng cấp để tách bạch **Chi phí sửa chữa (Labor Cost - Tiền công/Phí dịch vụ)** và **Tiền linh kiện (Parts Cost)** ở cả Backend (API) và Frontend (UI) cũng như luồng POS checkout.

## Chi tiết các thay đổi đã triển khai

### 1. Cập nhật Backend API
- **[Handover API](file:///m:/QLCH_VanLanh/src/app/api/repairs/handover/route.ts):**
  - Cập nhật công thức tính tổng số tiền thanh toán `amount` tại bước bàn giao máy: `amount = partsCost + laborCost + additionalFees - discountAmount`.
  - Hỗ trợ biến `laborCost` truyền từ client (do thu ngân xác định lại) hoặc tự động tính toán mặc định: `calculatedLaborCost = sum(ticket.issues.map(i => i.estimatedPrice))`.
  - Lưu `laborCost` tách biệt vào object `payment` của `RepairTicket` trong Firestore.
- **[Payment Edit API](file:///m:/QLCH_VanLanh/src/app/api/repairs/payment-edit/route.ts):**
  - Cho phép điều chỉnh giá trị `laborCost` từ `paymentData` gửi lên khi thu ngân muốn sửa đổi chi phí.
  - Cập nhật lại tổng `amount` dựa trên giá trị `laborCost` mới điều chỉnh.

### 2. Cập nhật Frontend UI & Form Bàn Giao
- **[Repair Handover Modal](file:///m:/QLCH_VanLanh/src/features/repairs/RepairHandoverModal.tsx):**
  - Thêm ô nhập liệu **Chi phí sửa chữa (Labor Cost)** để nhân viên có thể xem và chủ động điều chỉnh chi phí sửa chữa/tiền công khi bàn giao máy.
  - Khi mở Modal, giá trị mặc định được tự động điền bằng tổng `estimatedPrice` của các bệnh (`issues`) trên phiếu.
- **[Repair Editor Modal](file:///m:/QLCH_VanLanh/src/features/repairs/RepairEditorModal.tsx):**
  - Bổ sung trường `laborCost` vào form chỉnh sửa chi tiết phiếu sửa chữa, tự động cập nhật tổng chi phí sửa chữa dự kiến khi thêm/bớt các bệnh (`issues`).
- **[Repair Tickets UI (Detail Cards & Actions)](file:///m:/QLCH_VanLanh/src/app/admin/repairs/page.tsx):**
  - Cập nhật giao diện thẻ chi tiết phiếu sửa chữa hiển thị tách biệt rõ ràng 2 khoản chi phí: **Tiền linh kiện** và **Chi phí sửa chữa (Tiền công)** giúp thu ngân và khách hàng dễ dàng đối chiếu.

### 3. Tích hợp thanh toán trung tâm tại POS
- **[POS Cart Panel](file:///m:/QLCH_VanLanh/src/features/pos/PosCartPanel.tsx) & [POS Page](file:///m:/QLCH_VanLanh/src/app/admin/pos/page.tsx):**
  - Đảm bảo khi load phiếu sửa chữa sang POS để thanh toán, hệ thống ghi nhận chính xác cả `paymentLaborCost` và `partsCost` để gom vào giỏ hàng và in ra hóa đơn VietQR cho khách quét.

---

## Kết quả Xác minh
1. **Phiếu không có linh kiện:** Thử nghiệm tạo phiếu chỉ có bệnh (Estimated Price = 200,000đ), khi hoàn tất hóa đơn hiển thị chính xác tổng 200,000đ (Không còn lỗi hiển thị 0đ).
2. **Phiếu có cả linh kiện và dịch vụ:** Tạo phiếu có linh kiện (500,000đ) và bệnh (200,000đ), tổng tiền thanh toán hiển thị chính xác 700,000đ, hiển thị tách biệt 2 mục rõ ràng.
3. **Chỉnh sửa thanh toán:** Sử dụng tính năng "Sửa chi phí" (Payment Edit) để cập nhật thủ công Tiền công, hệ thống lưu trữ chính xác giá trị mới và tính toán lại tổng tiền hóa đơn đúng công thức.
