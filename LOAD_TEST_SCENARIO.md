# Kịch Bản Kiểm Thử Tải (Load & Concurrency Test)
**Quy mô:** 100 Khách hàng (Customers) + 10 Nhân viên (Staff/Admin) hoạt động đồng thời (Concurrent Users).

Mục tiêu của kịch bản này là kiểm thử giới hạn chịu tải (Stress Test) và kiểm tra lỗi chịu đồng bộ dữ liệu (Concurrency/Race Conditions) của hệ thống Firebase, Next.js API, và Cloud Run.

---

## 1. Hành vi của 100 Khách hàng (Concurrent Customers)
Khách hàng được chia làm các nhóm ngẫu nhiên, thực hiện các hành động liên tục trong khoảng thời gian 5-10 phút.

### Nhóm 1: "Săn" hàng Flash Sale (30 Khách)
- **Hành động:** Liên tục truy cập trang `/flash-sale` và trang chủ. Load sản phẩm liên tục, thi nhau thêm vào giỏ hàng (`CartDrawer`) và bấm **Thanh toán**.
- **Điểm nóng (Bottleneck):** Số lượng tồn kho (`stock`) và hàng chờ (`held`).
- **Mong đợi:** 30 người mua cùng 1 món chỉ còn số lượng 5 -> Chỉ 5 người đầu API `/api/checkout` báo thành công do `writeBatch` khóa tệp. 25 người còn lại phải nhận thông báo "Sản phẩm đã hết hàng hoặc không đủ số lượng". Không được phép âm kho.

### Nhóm 2: Tra cứu tiến độ & Đánh giá mạng lưới (25 Khách)
- **Hành động:** Truy cập /tracking. Nhập mã số điện thoại liên tục. Sau khi thấy trạng thái "Đã xong", 25 người này đồng loạt bấm qua trang `/rate` để đánh giá.
- **Điểm nóng:** Firebase Limit, API Server-side Rate Limit và API Google Maps.
- **Mong đợi:** Vượt qua Geofence. Phải đánh báo lỗi Rate Limit "HTTP 429 Too Many Requests" nếu 1 IP cố spam gửi quá 3 đánh giá/ngày.

### Nhóm 3: Đọc tin tức & Tương tác Chatbot AI (25 Khách)
- **Hành động:** Dạo qua bài viết `/tin-tuc`. Liên tục mở cửa sổ Chat Widget và hỏi AI "Máy tôi bị vỡ kính giá sửa bao nhiêu?", "Có màn hình iPhone 15 không?".
- **Điểm nóng:** Vượt quá quota API của Google Gemini. Tải nặng ở Realtime DB khi push nội dung.
- **Mong đợi:** Trả lời mượt. Nếu Gemini báo Limit, Chat phải log lỗi duyên dáng "Chatbot hiện tại đang bận, tư vấn viên sẽ phản hồi sau".

### Nhóm 4: Xem danh mục, Lọc SP và Tìm kiếm (20 Khách)
- **Hành động:** Ở tại `/category/dien-thoai-cu`. Liên tục cuộn phân trang, đổi bộ lọc giá tiền.
- **Điểm nóng:** Next.js Server Components. RAM OOM (Out Of Memory).
- **Mong đợi:** Dữ liệu Firebase có Limit(50) nên băng thông ổn, Next.js cache tốt, tải trang dưới 200ms bằng SSR cache.

---

## 2. Hành vi của 10 Nhân viên/Quản lý (Concurrent Staff)
Nhân viên sử dụng Dashbord nội bộ song song lúc có 100 khách truy cập.

### Nhóm 1: 3 Kỹ thuật viên (Technicians) ở quầy sửa chữa
- **Hành động:** 
  1. Thao tác tiếp nhận Walk-in: Chạy tạo phiếu sửa ở `/admin/repairs` liên tục.
  2. Bấm đổi trạng thái máy (từ Chờ khám -> Đang sửa -> Xong).
  3. Liên tục chọn Linh kiện (Parts/Phụ kiện) dồn vào giỏ sửa chữa. Tồn kho linh kiện bị trừ ngay lập tức.
- **Rủi ro kiểm tra:** Nếu 2 kỹ thuật viên cùng chọn viên pin iPhone 13 cuối cùng, ai lưu trước được nhận.

### Nhóm 2: 3 Nhân viên Bán hàng (POS)
- **Hành động:** Mở `/admin/pos` để quẹt mã vạch tính tiền cho khách offline. 
  - Đòi hỏi tính tiền nhanh nhất có thể. Giao dịch tranh chấp (Race condition) với **Nhóm 1 khách hàng đang mua online flash sale**. 
- **Rủi ro kiểm tra:** Mua online và quét mã vạch offline cùng 1 lúc 1 mã hàng. Atomic `writeBatch` phải ưu tiên 1 trong 2 và block cái còn lại.

### Nhóm 3: 2 Thủ kho (Inventory Managers)
- **Hành động:** Ở trong trang `/admin/inventory` và `/admin/products`.
  1. Liên tục mở `UniversalProductModal` để thêm linh kiện và máy mới mới.
  2. Load ảnh / up ảnh qua `MediaManager` cùng thời điểm.
- **Rủi ro kiểm tra:** Upload file lớn liên tục tạo nghẽn CPU trên trình duyệt khi nén WebP.

### Nhóm 4: 2 Quản lý / Chăm sóc khách hàng (Managers)
- **Hành động:** Lên `/admin/chat` đọc real-time 25 luồng inbox của khách.
- Duyệt Bài đánh giá `/admin/reviews` (Chuyển Hided -> Show).
- Viết bài SEO `/admin/articles` kèm Save/Upload thumbnail liên tục.
- **Rủi ro kiểm tra:** Giới hạn connection của Realtime DB và Socket.

---

## 3. CHECKLIST DÀNH CHO AUTO TEST TOOL CỦA BOT (Gợi ý)

Nếu sử dụng **K6 / Artillery** để mô phỏng tải tệp trên:

1. **[Script 1 - API/Checkout]** Bắn 100 requests POST `/api/checkout` trong 1 giây đến cùng 1 Product ID có Stock = 5. Verify kết quả: Exactly 5 returns Code 200, 95 returns Code 400 Out of Stock.
2. **[Script 2 - Rate Limiting]** Bắn 50 requests POST `/api/reviews` từ 1 IP. Verify: 3 request đầu pass, 47 request sau failed HTTP 429.
3. **[Script 3 - AI Chatbot]** Bắn 30 requests POST `/api/ai`. Verify: Không sập Server Next.js, nếu Gemini từ chối thì báo Graceful Error.
4. **[Script 4 - Cloud Run OOM Monitor]** Push 10 Nhân viên liên tục gọi SSR `/admin/products` và upload `/admin/articles`. Verify: RAM App Next.js > 512MB không bị Crash do OOM (Out Of Memory).

***Kết luận:*** Khối lượng đọc/ghi kết hợp đồng thời này tương đương đợt mở sale ngày lễ. Hệ thống thiết kế dùng `writeBatch` và `limit(50)` đã được tính toán để vượt qua tốt, nhưng cần Playwright/JMeter để đưa các kịch bản này vào chạy thực tế giả lập đo đạc.
