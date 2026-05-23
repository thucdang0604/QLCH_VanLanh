# Repair System Logic & Workflows - Deep Dive

Tài liệu này mô tả chi tiết các logic nghiệp vụ phức tạp và cơ chế vận hành ngầm của hệ thống quản lý sửa chữa tại Văn Lành Service.

---

## 1. Hệ thống Workflow Động (Workflow Engine)

Hệ thống không sử dụng các trạng thái cứng (hardcoded). Thay vào đó, nó vận hành dựa trên cấu hình `WorkflowNode` được lưu trong Firestore `system_config/repairs`.

### Cấu trúc một Workflow Node:
- **`id`**: Mã trạng thái (ví dụ: `cho_tiep_nhan`, `dang_sua_chua`).
- **`label`**: Tên hiển thị tiếng Việt.
- **`allowedNext`**: Danh sách các ID trạng thái có thể chuyển đến từ trạng thái này.
- **`allowedFeatures`**: Danh sách các tính năng được kích hoạt tại trạng thái này.
- **`isTerminal`**: Nếu `true`, phiếu sẽ được coi là hoàn tất (đóng phiếu).

### Các Tính năng (Features) quan trọng:
- **`requireChecklist`**: Bắt buộc phải hoàn thành 8 mục kiểm tra thiết bị đầu vào trước khi chuyển trạng thái.
- **`allowPartsSelection`**: Cho phép kỹ thuật viên chọn linh kiện từ kho.
- **`requirePartsReady`**: Ngăn chặn chuyển trạng thái nếu linh kiện yêu cầu (`requested`) chưa được nhập kho (`in_stock`).
- **`requirePaymentGate`**: Kích hoạt màn hình thanh toán/bàn giao khi chuyển sang trạng thái này.
- **`enableTechnicianCommission`**: Tự động tính hoa hồng cho kỹ thuật viên khi đạt đến trạng thái này.
- **`enableSellerCommission`**: Tự động tính hoa hồng cho nhân viên tiếp nhận/bán hàng.

---

## 2. Cơ chế Quản lý Kho Double-Entry (Stock & Held)

Hệ thống sử dụng cơ chế "Giữ hàng" (Held) để đảm bảo tính chính xác của tồn kho trong suốt vòng đời sửa chữa.

### Máy trạng thái tồn kho (Inventory State Machine):

| Hành động | Trạng thái Linh kiện | Biến động `stock` | Biến động `held` | Ghi chú |
| :--- | :--- | :--- | :--- | :--- |
| **Thêm vào phiếu** | `selected` | `-quantity` | `+quantity` | Hàng rời khỏi kho sẵn bán, chuyển vào kho "đang giữ". |
| **Hủy linh kiện** | `cancelled` | `+quantity` | `-quantity` | Trả hàng từ kho "đang giữ" về kho sẵn bán. |
| **Hoàn tất phiếu** | `done` | `0` | `-quantity` | Hàng chính thức rời khỏi hệ thống (trừ kho "đang giữ"). |
| **Trả máy (Out)** | `out` | `+quantity` | `-quantity` | Toàn bộ linh kiện đã chọn được trả về kho sẵn bán. |

### Tính năng Tự động Nhập hàng (Draft Receipts):
Khi kỹ thuật viên chọn linh kiện không có sẵn trong kho (hoặc đánh dấu `requested`):
- Hệ thống tự động tạo/cập nhật một tài liệu trong `import_receipts` với ID `draft_{ticketId}`.
- **Mục đích**: Tập hợp danh sách linh kiện cần mua cho Admin, tránh việc kỹ thuật viên phải báo cáo thủ công.
- **Trạng thái**: Phiếu này ở trạng thái `draft` và sẽ được Admin chuyển sang `ordered` hoặc `completed` khi hàng về.

> [!IMPORTANT]
> Toàn bộ các giao dịch kho được thực hiện thông qua **Firebase WriteBatch** hoặc **Transaction** để đảm bảo tính nguyên tử (Atomic). Nếu một cập nhật lỗi, toàn bộ thay đổi sẽ bị hủy.

---

## 3. Kiến trúc Hoa hồng (Commission Architecture)

Hoa hồng được tính toán tự động dựa trên một hệ thống quy tắc (Rules) phân cấp.

### Phân cấp Quy tắc (Hierarchy Level):
1. **Level 3 (Specific)**: Áp dụng cho một sản phẩm/linh kiện cụ thể (theo `productId`).
2. **Level 2 (Category)**: Áp dụng cho toàn bộ linh kiện trong một danh mục (ví dụ: "Màn hình iPhone").
3. **Level 1 (General)**: Quy tắc mặc định cho toàn bộ dịch vụ sửa chữa.

### Logic tính toán (`commissionUtils.ts`):
- **Base Amount**: Doanh thu thuần của phiếu (sau khi trừ giảm giá nếu rule yêu cầu).
- **Refund Logic**: Khi phiếu chuyển trạng thái `refund`, hệ thống tạo một bản ghi hoa hồng âm với suffix `_refund` để bù trừ trên báo cáo doanh thu của nhân viên.
- **Trigger**: Hoa hồng chỉ được ghi nhận khi trạng thái phiếu có feature `enable...Commission`.

---

## 4. Vòng đời Bảo hành (Warranty Lifecycle)

Hệ thống tự động hóa việc theo dõi bảo hành cho từng linh kiện riêng lẻ trong một phiếu sửa chữa, đảm bảo tính minh bạch và ngăn chặn gian lận.

### 4.1. Cơ chế Kích hoạt (Stamping)
Khi phiếu chuyển sang trạng thái terminal (`done`):
1. **Tra cứu quy tắc**: Hệ thống tra cứu `WarrantyRule` theo `partType` (Màn hình, Pin, v.v.). Nếu không có quy tắc riêng, sẽ áp dụng quy tắc mặc định của hệ thống.
2. **Tính toán**: Ngày hết hạn (`warrantyExpiry`) = `completedAt` + `warrantyMonths`.
3. **Snapshot**: Lưu snapshot thông tin bảo hành trực tiếp vào mảng `parts` của Ticket. Mỗi phần tử trong mảng sẽ có cấu trúc:
   ```typescript
   {
     productId: string,
     name: string,
     warrantyMonths: number,
     warrantyExpiresAt: Timestamp
   }
   ```

### 4.2. Logic Tiếp nhận & Kiểm tra (Validation)
Khi tạo phiếu bảo hành mới từ một phiếu gốc (`originalTicketId`):

1. **Kiểm tra Hiệu lực (Expiry Check)**:
   - Hệ thống so sánh thời điểm hiện tại với `warrantyExpiresAt` của linh kiện được chọn.
   - Nếu đã quá hạn, nút "Tạo bảo hành" sẽ bị vô hiệu hóa hoặc hiển thị cảnh báo đỏ.

2. **Ngăn chặn Trùng lặp (Duplicate Prevention)**:
   - Hệ thống thực hiện query Firestore để tìm các phiếu có cùng `originalTicketId` và `ticketType: 'warranty'`.
   - **Quy tắc**: Nếu tồn tại bất kỳ phiếu bảo hành nào đang ở trạng thái "Active" (không phải `done`, `out`, hoặc `refund`), hệ thống sẽ chặn việc tạo phiếu mới để tránh xử lý chồng chéo cho cùng một lỗi.

3. **Liên kết Dữ liệu (Deep Linkage)**:
   - Phiếu bảo hành mới kế thừa toàn bộ thông tin `customer` và `device` từ phiếu gốc.
   - Trường `originalTicketId` được sử dụng để tạo một "Sợi chỉ đỏ" xuyên suốt lịch sử sửa chữa của thiết bị.

### 4.3. Xử lý Hoàn phí (Warranty Refund)
Trong trường hợp không thể bảo hành (hết linh kiện thay thế hoặc lỗi tái diễn nhiều lần):
- Admin có thể thực hiện `Refund` (Hoàn phí).
- **Hệ thống**: Tự động tạo bản ghi hoa hồng âm (`_refund`) cho kỹ thuật viên đã thực hiện phiếu gốc, đảm bảo tính công bằng trong việc tính toán lương/thưởng.

---

## 5. Theo dõi Thời gian Thực (Status Timeline)

Mỗi thay đổi trạng thái được ghi lại trong mảng `statusTimeline`.

- **Mục đích**: Đo lường hiệu suất (KPI) và phát hiện điểm nghẽn (Bottlenecks) trong quy trình.
- **Dữ liệu**: `{ status, timestamp, durationInMinutes }`.
- **Logic tự động**: Khi chuyển từ trạng thái A sang B tại thời điểm T:
    1. Hệ thống tìm entry cuối cùng trong timeline (trạng thái A).
    2. Tính `durationInMinutes = (T - timestamp_A) / 60,000`.
    3. Cập nhật `duration` cho entry A và thêm entry B mới.

---

## 6. Công nghệ & Bảo mật API

- **Real-time Sync**: Sử dụng `onSnapshot` để đồng bộ cấu hình Workflow và Danh sách phiếu ngay lập tức khi Admin/KTV khác thao tác.
- **Optimistic UI**: Cập nhật trạng thái linh kiện ngay trên Client trước khi chờ Firebase phản hồi để tạo trải nghiệm mượt mà.
- **Rate Limiting**: Các API tạo nội dung AI (Gemini) được giới hạn để tránh spam và kiểm soát chi phí.
