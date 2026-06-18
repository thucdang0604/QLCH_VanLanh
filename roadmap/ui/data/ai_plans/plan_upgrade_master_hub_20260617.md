# Nâng cấp Master Hub Workflow Diagram

**Ngày:** 2026-06-17
**Trạng thái:** Hoàn tất

## Tổng quan
Cập nhật file tài liệu kiến trúc `roadmap/ai/modules/master.md` để phản ánh các thay đổi lớn trong hệ thống đã được triển khai, đảm bảo sơ đồ luồng nghiệp vụ (Workflow Diagram) luôn đồng bộ với mã nguồn thực tế. Việc nâng cấp này không thay đổi mã nguồn mà chỉ cập nhật thiết kế.

## Các thay đổi cụ thể trên biểu đồ:

1. **Kho hàng (INVENTORY MODULE):**
   - Đã thêm luồng "Excel Bootstrap / Import Số Lượng Lớn".
   - Tách quá trình chọn NCC thành mức chi tiết: "Chọn NCC cho Từng Mặt Hàng (Per-item NCC)".
   - Bổ sung nút thanh toán toàn phiếu: "Chọn Phương Thức Thanh Toán (Tiền Mặt / Ghi Nợ)".
   - Cập nhật quá trình ghi đè Transaction bao gồm "Nhóm & Ghi nhận Công Nợ NCC (supplier_transactions)".

2. **POS & Đơn hàng (POS_ORDERS):**
   - Nâng cấp luồng quét sản phẩm tại quầy bằng "Quét QR/Barcode (Keyboard/Camera)".
   - Đồng bộ luồng định danh thành viên thông qua "CRM Khách hàng (customers)".
   - Bổ sung gán hạng (Tier theo năm).
   - Tích hợp Discount Stacking engine với Vouchers/Missions.

3. **Sửa chữa (REPAIR_MOD):**
   - Định tuyến từ "Live Chat Omnichannel (FB/Zalo/Web)" qua "Modal CRM" rồi mới chuyển giao vào phiếu sửa chữa.
   - Thể hiện tính chất Workflow v2 qua các "Exit-gates" tại khâu kiểm tra.
   - Đưa quá trình tính giá bảo hành và linh kiện vào Transaction Handover theo đúng logic `handover/route.ts`.
   - Dynamic Invoices được vẽ rõ từ `taxonomyTree`.

4. **Tài chính & Nhân sự (FINANCE_HR):**
   - Tách biệt hai loại chi tiền nhà cung cấp (Import Paid thanh toán ngay và Supplier Debt trả nợ sau).

5. **Hệ thống & Nội dung (SYSTEM_CONTENT):**
   - Cập nhật luồng webhook đổ vào Realtime DB cho Omnichannel Chat.
   - Trỏ rõ quá trình cấu hình giao diện `layout_settings`.
