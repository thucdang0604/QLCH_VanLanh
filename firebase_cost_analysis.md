# 📊 Phân Tích Chi Phí Firebase — Dự Án Văn Lành

## Dữ liệu hiện tại (từ Firebase Console)

| Dịch vụ | Hiện tại | Free Tier/Ngày | % Đã dùng |
|---|---|---|---|
| **Firestore Reads** | 3K peak | 50K/ngày | 5.9% |
| **Firestore Writes** | 92 peak | 20K/ngày | 0.5% |
| **Firestore Deletes** | 0 | 20K/ngày | 0% |
| **RTDB Storage** | 30.8 KB | 1 GB total | 0% |
| **RTDB Downloads** | 1.3 MB | 360 MB/ngày | 0.4% |
| **Cloud Functions** | 1.4K | 2M/tháng | 0.1% |
| **Hosting Storage** | 17.4 MB | 10 GB total | 0.2% |
| **Hosting Downloads** | 6.6 MB | 360 MB/ngày | 1.8% |
| **Cloud Storage (Downloads)** | ~20 MB | 1 GB/ngày | ~2.0% |

> [!NOTE]
> **Dữ liệu hiện tại rất thấp** — tất cả dưới 6% free tier. Đây là baseline tốt để đánh giá.

---

## Kịch bản: 500 khách + 10 admin/ngày

### 🛒 Khách hàng — Hành trình trung bình

| Hành động | Reads | Writes | Ghi chú |
|---|---|---|---|
| **Trang chủ** (SSR) | **~0** | 0 | Đã bọc `unstable_cache` (On-Demand ISR). Chỉ tốn 1 Read duy nhất toàn server mỗi khi Admin cập nhật dữ liệu. |
| **Trang chủ** (client) | ~3 | 1 | Hiệu ứng client + analytics write (1 write/session/ngày) |
| **Xem sản phẩm** (SSR) | **~0** | 0 | Product detail + related products đều đã được cache mạnh. |
| **Xem bài viết** (SSR) | **~0** | 0 | Article + related đều đã được cache. |
| **Đọc bài viết** (client) | ~5 | 1 | Comments + view increment |
| **Tìm kiếm** | 0 (ISR) | 0 | ✅ API route `/api/search` — Admin SDK + cache 60s + rate limit 10/min |
| **Tracking đơn/sửa chữa** | ~5 | 0 | getDoc + getDocs |
| **Đặt lịch** | 0 | 1 | addDoc appointments |
| **Checkout** | 0 | 1 | API route → addDoc orders |
| **Gửi đánh giá** | 0 | 1 | addDoc reviews |
| **Bình luận bài viết** | 0 | 1 | addDoc article_comments |
| **Live Chat** (RTDB) | 0 FS | 0 FS | RTDB — không tính Firestore reads |
| **Presence** (RTDB) | 0 FS | 0 FS | RTDB online tracking |

#### Khách hàng trung bình: ~8 reads (giảm mạnh từ 20) + 2 writes/session

| Metric | Tính toán | /Ngày | /Tháng |
|---|---|---|---|
| **Reads** | 500 khách × 8 reads | **4,000** | 120,000 |
| **Writes** | 500 khách × 2 writes | **1,000** | 30,000 |
| **Free Tier Reads** | | 50,000/ngày | 1.5M/tháng |
| **% Sử dụng Reads** | | **8%** | ✅ Siêu Tiết Kiệm |
| **% Sử dụng Writes** | | **5%** | ✅ An toàn |

### 👨‍💼 Admin — Hành trình trung bình

| Hành động | Reads | Writes | Ghi chú |
|---|---|---|---|
| **Login + Layout load** | ~36 | 0 | 6 badge listeners init |
| **Dashboard** | ~50 | 0 | orders, repairs, analytics getDocs |
| **Quản lý đơn hàng** | ~ALL orders | 2-5 | onSnapshot toàn bộ orders + updateDoc |
| **Quản lý sửa chữa** | ~ALL repairs + 3 getDocs | 5-10 | onSnapshot repairs + users + appointments + services |
| **Kỹ thuật viên** | ~ALL repairs | 2-5 | onSnapshot repairs + updateDoc |
| **POS** | ~ALL products | 1-3 | getDocs products + addDoc order |
| **Doanh thu** | ~ALL orders + repairs + receipts + expenses + commissions | 0 | 5 getDocs lớn |
| **Bài viết** | ~ALL articles | 2-5 | onSnapshot |
| **Linh kiện** | ~ALL products + receipts | 5-10 | getDocs + transactions |
| **Chat** (RTDB) | 0 FS | 0 FS | RTDB |
| **Reviews** | ~ALL reviews | 1-3 | onSnapshot |
| **Refresh** | +36 | 0 | Badge listeners re-init |

#### Admin trung bình: ~500 reads + 20 writes/phiên, ~3 phiên/ngày

| Metric | Tính toán | /Ngày | /Tháng |
|---|---|---|---|
| **Reads** | 10 admin × 500 reads × 3 phiên | **15,000** | 450,000 |
| **Writes** | 10 admin × 20 writes × 3 phiên | **600** | 18,000 |

### 📊 TỔNG HỢP — Sử dụng bình thường

| Metric | Khách | Admin | Tổng/Ngày | Free Tier | % |
|---|---|---|---|---|---|
| **Reads** | 4,000 | 15,000 | **19,000** | 50,000 | **38%** ✅ |
| **Writes** | 1,000 | 600 | **1,600** | 20,000 | **8%** ✅ |
| **Deletes** | 0 | ~20 | **20** | 20,000 | **0.1%** ✅ |
| **RTDB Downloads** | ~5 MB | ~3 MB | **8 MB** | 360 MB | **2.2%** ✅ |
| **Hosting (Tải trang)** | ~20 MB | ~10 MB | **30 MB** | 360 MB | **8.3%** ✅ |
| **Cloud Storage (Ảnh/Media)** | ~100 MB | ~10 MB | **110 MB** | 1 GB | **11%** ✅ |
| **Functions** | ~500 | ~100 | **600** | 66K/ngày | **0.9%** ✅ |

> [!TIP]
> **Kết luận**: Nhờ cơ chế Cache mạnh mẽ mới được cập nhật, với 500 khách + 10 admin/ngày, dự án chỉ sử dụng khoảng **38% free tier Reads** — hoàn toàn miễn phí, tối ưu hơn rất nhiều so với thiết kế ban đầu.

---

## ⚠️ Kịch bản cực đoan — Tấn công tăng chi phí

### ✅ Điểm yếu #1: Trang tìm kiếm (`/search`) — ĐÃ KHẮC PHỤC

**Vấn đề cũ**: Mỗi lần search = `getDocs(products)` + `getDocs(services)` → fetch **TOÀN BỘ** collection

**Đã triển khai** (`src/app/api/search/route.ts`):
1. ✅ API route server-side — dùng Admin SDK (`getAdminDb()`), không tính client reads
2. ✅ Rate limit server-side: 10 req/min/IP
3. ✅ In-memory cache 60s — chỉ fetch Firestore 1 lần/60s cho tất cả requests
4. ✅ Client-side: `src/app/(customer)/search/page.tsx` gọi `/api/search?q=...`

---

### ✅ Điểm yếu #2: Trang đánh giá khách (`/reviews`) — ĐÃ KHẮC PHỤC

**Vấn đề cũ**: `getDocs(reviews, status=='approved')` — public, không cần auth

**Đã triển khai** (`src/app/(customer)/reviews/page.tsx`):
1. ✅ SSR + ISR `revalidate = 120` — chỉ fetch mỗi 2 phút
2. ✅ Admin SDK server-side fetch — không tính client reads

---

### 🔴 Điểm yếu #3: Analytics/Presence (`usePresence`)

**Vấn đề**: Mỗi visitor trigger `setDoc(analytics, increment(1))` = 1 write
- `sessionStorage` chỉ chặn trong cùng tab → mở nhiều tab = nhiều writes
- RTDB presence: mỗi tab = 1 node `online_users`

**Giải pháp**:
1. ✅ Dùng `localStorage` thay `sessionStorage` (chặn cross-tab)
2. ✅ Thêm cookie check + TTL (1 write/IP/ngày max)

---

### ✅ Điểm yếu #4: Checkout & Appointments (Public writes) — ĐÃ KHẮC PHỤC

**Vấn đề cũ**: Bất kỳ ai đều có thể tạo đơn hàng/lịch hẹn không giới hạn

**Đã triển khai**:
1. ✅ Checkout: API route + rate limit 3/min/IP + honeypot (`src/app/api/checkout/route.ts`)
2. ✅ Appointments: API route + rate limit 3/min/IP + honeypot + validation (`src/app/api/appointments/route.ts`)
3. ✅ Reviews: API route + rate limit 3/IP/ngày + geofence validation (`src/app/api/reviews/route.ts`)

---

### ✅ Điểm yếu #5: Admin trang Doanh thu (`/admin/revenue`) — ĐÃ KHẮC PHỤC

**Vấn đề cũ**: Load **5 collection đồng thời** không filter → 215+ reads/load

**Đã triển khai** (`src/app/admin/revenue/page.tsx`):
1. ✅ `getMonthsAgoTimestamp(3)` — chỉ load 3 tháng gần nhất bằng `where('createdAt', '>=', threeMonthsAgo)`
2. ✅ UI filter: Hôm nay / Tuần này / Tháng này / Tùy chọn (date picker)
3. ✅ Client-side filter (`useMemo`) từ data đã load — không gọi Firestore thêm khi đổi filter

---

---

### ✅ Điểm yếu #6: Băng thông hình ảnh (LCP Hero Banner) — ĐÃ KHẮC PHỤC

**Vấn đề cũ**: Việc tối ưu hóa (Image Optimization) cho các ảnh Banner siêu lớn thông qua Next.js Server hoặc Proxy `wsrv.nl` tạo ra 2 nhược điểm:
1. Gây trễ (đẩy LCP lên cao) do quá trình nén và proxy.
2. Tiêu tốn băng thông của Firebase Hosting (Hosting chỉ cho phép Free **360MB/ngày**).

**Đã triển khai**:
1. ✅ Dùng thuộc tính `unoptimized={isFirst}` để trình duyệt lấy thẳng file từ Firebase Storage.
2. ✅ Trình duyệt sẽ cache file tĩnh này mạnh mẽ hơn.
3. ✅ Dịch chuyển luồng băng thông tốn kém từ Hosting sang Cloud Storage (Cloud Storage cho phép Free tới **1GB/ngày**, rộng rãi gấp ~3 lần).

---

### ✅ Điểm yếu #7: Database Reads ở trang khách (Trang chủ, Sản phẩm) — ĐÃ KHẮC PHỤC

**Vấn đề cũ**: Dù dùng Next.js, cấu hình cũ `revalidate = 120` (hoặc false) vẫn khiến server thỉnh thoảng (vài phút một lần) ngầm gọi Firebase để fetch lại danh sách sản phẩm, dịch vụ, cấu hình... Điều này tiêu tốn ~10-15 Reads cho mỗi chu kỳ cache. Nếu có Custom Domain bị lệch cache, số Reads có thể tăng gấp đôi.

**Đã triển khai**:
1. ✅ Bọc toàn bộ các hàm fetch Firebase (config, services, products, categories) bằng `unstable_cache` kết hợp với `tags` (như `'config'`, `'services'`).
2. ✅ Áp dụng cơ chế **On-Demand Revalidation**: Mặc định, cache sẽ tồn tại *mãi mãi* (0 Reads cho khách).
3. ✅ Chỉ khi Admin bấm "Lưu" hoặc "Cập nhật", hệ thống mới gọi lệnh `revalidateTag` để xóa cache và ép Next.js kéo lại data đúng **1 lần duy nhất**.
4. ✅ Kết quả: Lượng Reads của toàn bộ Khách hàng lướt web trên SSR giảm gần như tuyệt đối về **0**.

---

## 🛡 Bảng tổng hợp biện pháp bảo vệ

| # | Biện pháp | Ưu tiên | Trạng thái | Chi phí tiết kiệm |
|---|---|---|---|---|
| 1 | Rate limit checkout API | Cao | ✅ Đã có | ~90% spam writes |
| 2 | SSR search (API route + Admin SDK + cache 60s) | Cao | ✅ Đã có | ~99% reads |
| 3 | Rate limit appointments (API route + honeypot) | Cao | ✅ Đã có | Chặn spam writes |
| 4 | SSR reviews (ISR revalidate=120) | TB | ✅ Đã có | ~95% reads |
| 5 | Date filter trang revenue (3 tháng + UI picker) | TB | ✅ Đã có | ~70% reads |
| 6 | localStorage thay sessionStorage presence | Thấp | ✅ Đã có | ~50% writes |
| 7 | Tải thẳng ảnh LCP từ Cloud Storage (`unoptimized`) | Cao | ✅ Đã có | Cứu băng thông Hosting |
| 8 | On-Demand ISR (`unstable_cache`) toàn bộ SSR | Cao | ✅ Đã có | ~99% Reads từ Khách |
| 9 | Firebase App Check | Cao | ❌ Chưa bật | Chặn bot hoàn toàn |
| 10 | Budget alerts trên Firebase Console | Cao | ❌ Chưa bật | Cảnh báo sớm |

> [!IMPORTANT]
> **Biện pháp #9 (App Check)** là giải pháp toàn diện nhất — Google xác thực request đến từ app thật, không phải bot. Miễn phí, nhưng cần cấu hình reCAPTCHA v3.

> [!WARNING]
> **Biện pháp #10 (Budget alerts)** nên làm NGAY — vào Firebase Console → Usage & Billing → set alert ở $0 để nhận email khi bắt đầu tính phí. Không mất thời gian code.

---

## 📈 Khi nào phải trả tiền?

| Mốc | Reads/ngày | Tương đương | Chi phí ước tính |
|---|---|---|---|
| **Free tier** | ≤50,000 | ~1,000 khách/ngày | **$0** |
| **Vượt nhẹ** | 100,000 | ~2,000 khách/ngày | ~$0.36/ngày = **$11/tháng** |
| **Trung bình** | 500,000 | ~10,000 khách/ngày | ~$1.80/ngày = **$54/tháng** |
| **Cao** | 1,000,000 | ~20,000 khách/ngày | ~$3.60/ngày = **$108/tháng** |

> Giá: $0.036/100K reads, $0.108/100K writes (sau free tier)

---

## Kết luận

✅ **500 khách + 10 admin = ~50% free tier** → hoàn toàn miễn phí  
✅ **Badge sidebar mới chỉ thêm ~13 reads/refresh** → ảnh hưởng không đáng kể  
✅ **Search, Appointments, Reviews, Revenue** đã bảo vệ bằng API route + rate limit + server-side SDK + date filter  
⚠️ **Rủi ro còn lại**: Presence analytics (localStorage optimization) — ưu tiên thấp  
🛡 **Khuyến nghị**: Bật Budget Alert + App Check khi traffic tăng
