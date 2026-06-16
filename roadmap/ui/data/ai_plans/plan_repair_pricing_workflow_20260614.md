# Cập nhật Workflow Sửa chữa & Logic Tính Giá (Tránh lỗi Bill 0đ)

Đề xuất giải pháp và lộ trình cập nhật luồng vận hành, logic tính giá cho nghiệp vụ sửa chữa, đảm bảo tách bạch chi phí sửa chữa (tiền công/phí dịch vụ) và tiền linh kiện, khắc phục triệt để tình trạng phiếu hoàn tất hiển thị 0đ khi không dùng linh kiện.

## User Review Required

> [!IMPORTANT]
> **Xác nhận Phương pháp tính Chi phí sửa chữa**
> Theo kế hoạch này, **Chi phí sửa chữa = Tổng "Giá dự kiến"** của tất cả các bệnh đã được KTV thêm vào. KTV/Thu ngân có thể sửa lại Chi phí sửa chữa tại bước Hoàn Tất (Handover) hoặc khi thanh toán tại POS. Xin xác nhận nếu cách tính mặc định này đã khớp với nghiệp vụ thực tế của cửa hàng.

> [!TIP]
> **Tự động hóa luồng Kho**
> Trạng thái `dang_tim_linh_kien` sẽ không còn yêu cầu KTV bấm chuyển sang `da_dat_linh_kien` nữa. Hệ thống sẽ để bộ phận Kho thao tác (sau này có thể viết webhook/tự động chuyển trạng thái).

## Proposed Changes

### Logic Tính Giá API

#### [MODIFY] [route.ts](file:///m:/QLCH_VanLanh/src/app/api/repairs/handover/route.ts)
- Thay đổi công thức tính `amount` tại bước Handover.
- Khai báo biến `laborCost` được lấy từ client (khi thu ngân chốt bill) hoặc tính mặc định: `laborCost = sum(ticket.issues.map(i => i.estimatedPrice))`.
- `amount = partsCost + laborCost + additionalFees - discountAmount`.
- Lưu `laborCost` vào `payment` object của phiếu sửa chữa.

#### [MODIFY] [route.ts](file:///m:/QLCH_VanLanh/src/app/api/repairs/payment-edit/route.ts)
- Tương tự Handover API, thêm việc tiếp nhận và xử lý `laborCost` từ `paymentData` khi thu ngân muốn sửa đổi chi phí.
- Cho phép chỉnh sửa `laborCost` độc lập với `partsCost`.

### Cập nhật UI & Form Bàn Giao

#### [MODIFY] [page.tsx](file:///m:/QLCH_VanLanh/src/app/admin/repairs/page.tsx)
- Tại Modal "Hoàn Tất Phiếu / Bàn Giao" (hoặc Modal Edit Payment), bổ sung trường nhập liệu **Chi phí sửa chữa (Labor Cost)**.
- Khi render Modal, trường này được điền sẵn giá trị tổng từ các bệnh (issues).
- Tại thẻ chi tiết phiếu (Repair Ticket Detail), hiển thị tách biệt: Tiền Linh Kiện vs Chi phí sửa chữa.

#### [MODIFY] [page.tsx](file:///m:/QLCH_VanLanh/src/app/admin/pos/page.tsx)
- Đảm bảo khi load phiếu sửa chữa vào POS, hệ thống ghi nhận đúng `laborCost` bên cạnh `partsCost` để hiển thị trên hóa đơn khách hàng.

### Cập nhật Workflow Config & Types

#### [MODIFY] [repairWorkflowConfig.ts](file:///m:/QLCH_VanLanh/src/lib/repairWorkflowConfig.ts)
- Thêm cờ tính năng `allowLaborCostEdit` hoặc `autoCalculateLabor` vào cấu hình các trạng thái Terminal (như `done`, `out`).
- Cập nhật logic để trạng thái `dang_sua_chua` có cờ cho phép thêm bệnh/mượn linh kiện mà không bị chặn cứng.

#### [MODIFY] [types.ts](file:///m:/QLCH_VanLanh/src/lib/types.ts)
- Xác minh lại `laborCost` trong `RepairTicket.payment` (đã có sẵn). Không cần sửa nhiều ngoài việc đảm bảo comment documentation rõ ràng.

## Verification Plan

### Cập nhật tính giá
1. Tạo một phiếu sửa chữa mới, thêm bệnh với giá dự kiến 200,000đ.
2. Không thêm linh kiện nào.
3. Chuyển phiếu đến bước "Chờ bàn giao" hoặc "Hoàn tất".
4. Kiểm tra xem Modal Hoàn tất có hiển thị Chi phí sửa chữa = 200,000đ và Tổng = 200,000đ không. (Không còn lỗi 0đ).

### Cập nhật linh kiện
1. Thêm linh kiện giá 500,000đ vào phiếu trên.
2. Kiểm tra Modal Hoàn tất xem Tổng = Chi phí sửa chữa (200k) + Tiền linh kiện (500k) = 700,000đ.

### Chỉnh sửa UI
1. Mở Modal chỉnh sửa chi phí (Payment Edit), thử nhập tay thay đổi Chi phí sửa chữa thành 250,000đ.
2. Kiểm tra lưu trữ DB và giao diện in hóa đơn xem Chi phí sửa chữa có được ghi nhận tách biệt không.
