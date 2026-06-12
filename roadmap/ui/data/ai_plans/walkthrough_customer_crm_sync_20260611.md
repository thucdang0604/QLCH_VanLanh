# Cập nhật Đồng bộ Customer CRM

Hệ thống đã được cập nhật để tự động thu thập và đồng bộ thông tin khách hàng (SĐT và Tên) từ nhiều điểm chạm khác nhau về một nguồn dữ liệu duy nhất (`customers`), làm nền tảng cho hệ thống hạng thành viên và voucher.

## Các thay đổi chính

### 1. API dùng chung (`/api/customers/sync`)
- Tạo mới API POST tại `src/app/api/customers/sync/route.ts`.
- API này nhận SĐT và Tên, chuẩn hóa SĐT, và thực hiện upsert vào bảng `customers` thông qua `db.runTransaction`.
- Tự động bỏ qua tên "Khách lẻ" khi khách cung cấp tên thật.

### 2. Admin Repairs (`src/app/admin/repairs/page.tsx`)
- Tích hợp logic gọi API `/api/customers/sync` sau khi tạo mới hoặc cập nhật phiếu sửa chữa thành công.

### 3. Đặt lịch trên Web (`src/app/api/appointments/route.ts`)
- Tích hợp trực tiếp logic cập nhật CRM khi khách đặt lịch thành công.
- Không cần gọi mạng ngoài vì API chạy phía server, trực tiếp sử dụng Firebase Admin SDK.

### 4. Bán hàng tại quầy (POS) (`src/app/api/pos/checkout/route.ts`)
- Sửa lỗi không cập nhật tên khách hàng khi nhân viên nhập tên khác "Khách lẻ".
- Tích hợp `normalizeVietnamPhone` để đồng bộ đúng định dạng số điện thoại chuẩn (`0xxxxxxxxx`).

### 5. Chat Widget (`src/components/ChatWidget.tsx`)
- Thêm lời gọi API `/api/customers/sync` khi khách hàng để lại thông tin Tên + SĐT để bắt đầu chat, hỗ trợ liên kết thông tin khách hàng từ sớm.

> [!TIP]
> Tất cả các thông tin từ khách hàng cung cấp (cả khi họ tạo đơn sửa chữa, đặt lịch, hay chat) đều đã được lưu vào danh sách khách hàng chính. Chỗ này sẽ là nền tảng rất vững chắc để xây dựng các logic tự động chiết khấu, thăng hạng thành viên sau này.

### 6. Cập nhật sửa lỗi PERMISSION_DENIED
- Khắc phục lỗi bảo mật Firebase Realtime Database khi khách truy cập Public Chat. Lỗi xảy ra do client tự đẩy tin nhắn trả lời tự động của AI (với vai trò `admin`), bị hệ thống từ chối quyền.
- Chuyển logic đẩy tin nhắn AI về API phía Server (`src/app/api/ai/route.ts`) sử dụng Admin SDK để qua mặt rào cản phân quyền phía Client.

### 7. Tối ưu hoá tìm kiếm khách hàng tại POS
- Cải thiện ô tìm kiếm SĐT trong POS: Ngoài việc tìm kiếm thông tin theo lịch sử đơn sửa chữa, POS giờ đây sẽ tìm kiếm trực tiếp trong danh sách `customers` để điền trước tên khách hàng, hạn chế tối đa việc Admin vô tình thay đổi tên chuẩn của khách thành "Khách lẻ" khi thanh toán.
