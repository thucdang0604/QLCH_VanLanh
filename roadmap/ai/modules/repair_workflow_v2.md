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
