# Repair Workflow Firestore V2

## BUG-REP-012: Workflow có hai nguồn và semantics feature không đồng nhất
- **Status:** fixed
- **Severity:** high
- **Date:** 2026-06-12
- **Files:** `src/lib/repairWorkflowConfig.ts`, `src/lib/repairWorkflowServer.ts`, `src/app/api/repairs/transition/route.ts`, `src/app/admin/settings/repairs/page.tsx`, `scripts/migrate-repair-workflow-v2.ts`

### Nguyên nhân
Document `system_config/repairs` đồng thời chứa `repairStatuses` và trường legacy `statuses`. UI kiểm tra checklist/linh kiện trên trạng thái hiện tại nhưng API lại kiểm tra trạng thái đích, làm cùng một cấu hình có thể cho kết quả khác nhau.

### Cách khắc phục
- Chỉ sử dụng `repairStatuses` làm nguồn runtime cho phiếu sửa chữa; `statuses` được giữ nguyên làm dữ liệu legacy, chưa xóa.
- Chuẩn hóa feature bắt buộc theo ID trạng thái và semantics `exit-gates-v1`: `requireChecklist`, `requirePartsReady`, `requireTechnicianNote`, `requirePaymentGate` phải hoàn tất trước khi rời trạng thái hiện tại.
- Bổ sung validator chống ID trùng, nhánh trỏ tới trạng thái không tồn tại, terminal có nhánh đi tiếp và tracking group map trùng.
- Migration Firestore v2 đã chạy ngày 2026-06-12, có backup trước khi ghi và đã kiểm tra idempotent.

### Trạng thái migration
- `repairStatuses`: 9 trạng thái, đã chuẩn hóa.
- `warrantyStatuses`: 6 trạng thái, đã chuẩn hóa.
- `statuses`: giữ nguyên, runtime không đọc.
- `next`: giữ nguyên để bảo toàn dữ liệu, runtime chỉ dùng `allowedNext`.

## Business Logic & Lộ Trình Triển Khai (Mới Cập Nhật 2026-06-14)
Sau khi thống nhất luồng vận hành thực tế tại cửa hàng, hệ thống sẽ được nâng cấp theo các nguyên tắc sau:

### 1. Luồng Trạng Thái (Status Workflow)
- **Gộp Trạng thái Linh Kiện:** Cải tiến tính năng tự động hóa ở phần Kho. KTV không cần thao tác nút chuyển sang "Đã đặt linh kiện". Trạng thái `dang_tim_linh_kien` sẽ tự động chuyển thành `da_dat_linh_kien` (hoặc thông báo) khi bộ phận kho/mua hàng có thao tác báo đủ linh kiện.
- **Tính linh hoạt ở `dang_sua_chua`:** Mặc dù đã chốt bệnh và giá, KTV vẫn được phép lấy/mượn thêm linh kiện để test và thêm bệnh mới trong lúc sửa chữa nếu có phát sinh (Không khóa cứng phiếu).
- **Thanh toán tập trung tại POS:** Trạng thái `cho_ban_giao_khach` sẽ được thu ngân xử lý thông qua màn hình POS (kết hợp các tính năng áp voucher, quà tặng, dịch vụ).

### 2. Logic Tính Giá (Pricing Logic)
Công thức tính giá ở các bước `handover` và `payment-edit` sẽ được sửa lại để khắc phục lỗi **"Bill 0đ"**:
- **Tiền Công (Labor Cost) =** Mặc định bằng tổng số tiền (Giá dự kiến) của các "Bệnh" đã chốt ở bước kiểm tra.
- **Tiền Linh Kiện (Parts Cost) =** Tổng giá trị các linh kiện đã sử dụng.
- **Tổng Bill =** `Tiền Công` + `Tiền Linh kiện` - `Giảm giá/Voucher` + `Phí khác`.
- **Đặc biệt:** Cho phép thu ngân/KTV điều chỉnh tay "Tiền công" tại bước Hoàn tất nếu cần.

### 3. Kiến Trúc Cấu Hình Động (Config-Driven)
Tuân thủ nguyên tắc **No Hardcode**, toàn bộ các tính năng đều được gắn cờ (Feature Flags) qua Firestore `system_config`:
- Các rule như: `autoTransitionOnPartReady`, `calculateLaborCostFromIssues`, `allowEditIssuesDuringRepair`...
- Admin (Quản lý) sẽ bật/tắt các rule này trên giao diện Settings, hệ thống tự động react mà không cần đổi code.
