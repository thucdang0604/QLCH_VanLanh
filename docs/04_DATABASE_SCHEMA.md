# Database Schema - Văn Lành Service Management

Hệ thống sử dụng **Google Cloud Firestore (NoSQL)** làm cơ sở dữ liệu chính, kết hợp với Realtime Database cho các tính năng Chat.

---

## 1. Core Collections

### 1.1. `users`
Lưu trữ định danh và phân quyền nhân viên/khách hàng.
- `uid`: string (Primary Key)
- `email`: string
- `role`: `'admin' | 'staff' | 'customer'`
- `membership_level`: `'Smember' | 'Gold' | 'Silver' | 'Bronze'`
- `phone`, `address`: string

### 1.2. `products` (Linh kiện & Sản phẩm)
- `id`: string
- `name`, `brand`: string
- `categoryIds`: string[] (Hỗ trợ truy vấn theo cây danh mục, ví dụ: `['sua-chua', 'sua-chua/iphone']`)
- `price_original`, `price_promo`: number (Giá bán lẻ)
- `costPrice`: number (Giá vốn bình quân - Weighted Average)
- **`stock`**: number (Số lượng thực tế còn trong kho sẵn bán)
- **`held`**: number (Số lượng đã được "đặt chỗ" bởi các phiếu sửa chữa/đơn hàng chưa hoàn tất)
- `status`: `'active' | 'hidden' | 'inactive'`

### 1.3. `repairs` (Repair Tickets)
Đây là collection phức tạp nhất, chứa toàn bộ vòng đời của một ca sửa chữa.
- `id`: string
- `ticketType`: `'repair' | 'warranty'` (Phân loại phiếu sửa chữa hay phiếu bảo hành)
- `customer`: `{ name, phone }`
- `deviceInfo`: `{ model, imei, passcode, checklist }`
  - `checklist`: Map các đầu mục kiểm tra ngoại quan và chức năng (OK/Error).
- **`status`**: string (Trạng thái động theo cấu hình Workflow)
- **`statusTimeline`**: `array<{ status, timestamp, durationInMinutes }>` (Lịch sử trạng thái và thời gian xử lý)
- **`parts`**: `array` các linh kiện sử dụng:
  - `productId`: ID sản phẩm trong kho.
  - `unitPriceAtUse`, `unitCostAtUse`: Giá bán/vốn snapshot tại thời điểm kỹ thuật viên chọn linh kiện.
  - `status`: `'selected' | 'requested' | 'in_stock' | 'unavailable'`
  - `warrantyMonths`: Thời hạn bảo hành được "đóng dấu" khi hoàn tất.
  - `warrantyExpiresAt`: Timestamp hết hạn bảo hành.
- **`warrantyClaim`**: (Chỉ có khi `ticketType === 'warranty'`)
  - `originalTicketId`: Link tới phiếu sửa chữa gốc.
  - `claimedPartIndexes`: Các index linh kiện trong phiếu gốc bị lỗi.
  - `refundedParts`: `array<{ originalPartIndex, productName, refundAmount }>` (Thông tin hoàn phí linh kiện).
- `payment`: `{ status, amount, partsCost, laborCost, depositAmount, additionalFees, discountAmount }`
- `staff`: `{ createdBy, assignedTechnician }`

### 1.4. `orders` (Đơn hàng Storefront)
- `items`: `array<{ productId, productName, quantity, price }>`
- `payment_method`: `'COD' | 'Bank' | 'Momo' | 'Card'`
- `status`: `'Pending' | 'Confirmed' | 'Shipping' | 'Completed' | 'Cancelled'`

---

## 2. Hệ thống Quản trị & Cấu hình (`system_config`)

Sử dụng Document ID cố định để quản lý hành vi toàn hệ thống:

### 2.1. `repairs` (Workflow & Warranty Rules)
- **`repairStatuses`**: Mảng `WorkflowNode` cho quy trình sửa chữa thường.
- **`warrantyStatuses`**: Mảng `WorkflowNode` cho quy trình bảo hành.
- **`warrantyRules`**: `array<{ partType, warrantyMonths }>` (Quy tắc tính bảo hành tự động theo loại linh kiện).

### 2.2. `commission_rules`
Collection riêng biệt quản lý hoa hồng nhân viên:
- `hierarchyLevel`: `1` (General), `2` (Category), `3` (Specific Product).
- `type`: `'repair' | 'order' | 'all'`.
- `percentage`: % hoa hồng.
- `applyAfterDiscount`: boolean (Tính hoa hồng sau khi trừ khuyến mãi).

---

## 3. Nhật ký & Audit (`commissions`, `inventory_logs`)

- **`commissions`**: Lưu lịch sử chi trả hoa hồng.
  - `sourceId`: ID của Ticket/Order phát sinh.
  - `amount`: Số tiền (Có thể âm nếu là `_refund` do hoàn phí).
- **`import_receipts`**: Phiếu nhập hàng từ NCC, dùng để cập nhật `stock` và `costPrice`.
- **`analytics_visits`**: Lưu vết truy cập để báo cáo Traffic.

---

> [!TIP]
> Chi tiết về logic nghiệp vụ (Inventory, Commission, Warranty) vui lòng tham khảo tại: [06_REPAIR_SYSTEM_LOGIC.md](file:///m:/QLCH_VanLanh/docs/06_REPAIR_SYSTEM_LOGIC.md)
