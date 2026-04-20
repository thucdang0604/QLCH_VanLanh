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
| **Cloud Storage** | — | 5 GB total | — |

> [!NOTE]
> **Dữ liệu hiện tại rất thấp** — tất cả dưới 6% free tier. Đây là baseline tốt để đánh giá.

---

## Kịch bản: 500 khách + 10 admin/ngày

### 🛒 Khách hàng — Hành trình trung bình

| Hành động | Reads | Writes | Ghi chú |
|---|---|---|---|
| **Trang chủ** (SSR) | ~8 | 0 | products, services, articles, reviews, config (Admin SDK — cached ISR) |
| **Trang chủ** (client) | ~3 | 1 | Hiệu ứng client + analytics write (1 write/session/ngày) |
| **Xem sản phẩm** (SSR) | ~3 | 0 | Product detail + related products |
| **Xem bài viết** (SSR) | ~2 | 0 | Article + related |
| **Đọc bài viết** (client) | ~5 | 1 | Comments + view increment |
| **Tìm kiếm** | ~50-200 | 0 | ⚠️ getDocs toàn bộ products + services |
| **Tracking đơn/sửa chữa** | ~5 | 0 | getDoc + getDocs |
| **Đặt lịch** | 0 | 1 | addDoc appointments |
| **Checkout** | 0 | 1 | API route → addDoc orders |
| **Gửi đánh giá** | 0 | 1 | addDoc reviews |
| **Bình luận bài viết** | 0 | 1 | addDoc article_comments |
| **Live Chat** (RTDB) | 0 FS | 0 FS | RTDB — không tính Firestore reads |
| **Presence** (RTDB) | 0 FS | 0 FS | RTDB online tracking |

#### Khách hàng trung bình: ~20 reads + 2 writes/session

| Metric | Tính toán | /Ngày | /Tháng |
|---|---|---|---|
| **Reads** | 500 khách × 20 reads | **10,000** | 300,000 |
| **Writes** | 500 khách × 2 writes | **1,000** | 30,000 |
| **Free Tier Reads** | | 50,000/ngày | 1.5M/tháng |
| **% Sử dụng Reads** | | **20%** | ✅ An toàn |
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
| **Reads** | 10,000 | 15,000 | **25,000** | 50,000 | **50%** ✅ |
| **Writes** | 1,000 | 600 | **1,600** | 20,000 | **8%** ✅ |
| **Deletes** | 0 | ~20 | **20** | 20,000 | **0.1%** ✅ |
| **RTDB Downloads** | ~5 MB | ~3 MB | **8 MB** | 360 MB | **2.2%** ✅ |
| **Hosting** | ~50 MB | ~10 MB | **60 MB** | 360 MB | **17%** ✅ |
| **Functions** | ~500 | ~100 | **600** | 66K/ngày | **0.9%** ✅ |

> [!TIP]
> **Kết luận**: Với 500 khách + 10 admin/ngày, dự án sử dụng khoảng **50% free tier Reads** — hoàn toàn miễn phí, còn headroom thoải mái.

---

## ⚠️ Kịch bản cực đoan — Tấn công tăng chi phí

### 🔴 Điểm yếu #1: Trang tìm kiếm (`/search`)

**Vấn đề**: Mỗi lần search = `getDocs(products)` + `getDocs(services)` → fetch **TOÀN BỘ** collection
- 100 sản phẩm + 20 dịch vụ = **120 reads/lần search**
- Bot spam 1000 lần/ngày = **120,000 reads** → **vượt free tier**

**Giải pháp**:
1. ✅ Chuyển sang SSR search (giống trang chủ) — dùng Admin SDK, không tính client reads
2. ✅ Thêm rate limit cho search (debounce 500ms đã có, nhưng cần server-side limit)
3. ✅ Cache results bằng ISR hoặc React Query

---

### 🔴 Điểm yếu #2: Trang đánh giá khách (`/reviews`)

**Vấn đề**: `getDocs(reviews, status=='approved')` — public, không cần auth
- Mỗi load = đọc toàn bộ approved reviews
- Bot spam refresh = nhiều reads

**Giải pháp**:
1. ✅ Chuyển sang SSR + ISR (revalidate 60s)
2. ✅ Thêm pagination (limit 20)

---

### 🔴 Điểm yếu #3: Analytics/Presence (`usePresence`)

**Vấn đề**: Mỗi visitor trigger `setDoc(analytics, increment(1))` = 1 write
- `sessionStorage` chỉ chặn trong cùng tab → mở nhiều tab = nhiều writes
- RTDB presence: mỗi tab = 1 node `online_users`

**Giải pháp**:
1. ✅ Dùng `localStorage` thay `sessionStorage` (chặn cross-tab)
2. ✅ Thêm cookie check + TTL (1 write/IP/ngày max)

---

### 🟡 Điểm yếu #4: Checkout & Appointments (Public writes)

**Vấn đề**: Bất kỳ ai đều có thể tạo đơn hàng/lịch hẹn
- Checkout: **đã có** rate limit 3 req/min/IP + honeypot ✅
- Appointments: **chưa có** rate limit ❌

**Giải pháp**:
1. ✅ Checkout đã bảo vệ (API route + rate limit)
2. ❌ **Appointments cần thêm**: chuyển sang API route + rate limit (hiện tại dùng client-side `addDoc` trực tiếp)
3. ❌ **Reviews cần thêm**: cùng vấn đề — client `addDoc` trực tiếp

---

### 🟡 Điểm yếu #5: Admin trang Doanh thu (`/admin/revenue`)

**Vấn đề**: Load **5 collection đồng thời** (orders, repairs, receipts, commissions, expenses) — tất cả không có filter
- 100 orders + 50 repairs + 30 receipts + 20 commissions + 15 expenses = **215 reads/load**
- Admin refresh 50 lần = 10,750 reads

**Giải pháp**:
1. ✅ Thêm date range filter (chỉ load tháng hiện tại)
2. ✅ Cache client-side (React Query / SWR)

---

## 🛡 Bảng tổng hợp biện pháp bảo vệ

| # | Biện pháp | Ưu tiên | Trạng thái | Chi phí tiết kiệm |
|---|---|---|---|---|
| 1 | Rate limit checkout API | Cao | ✅ Đã có | ~90% spam writes |
| 2 | SSR search thay client getDocs | Cao | ❌ Chưa làm | ~120 reads/lần search |
| 3 | Rate limit appointments (API route) | Cao | ❌ Chưa làm | Chặn spam writes |
| 4 | Pagination reviews customer page | TB | ❌ Chưa làm | ~80% reads |
| 5 | Date filter trang revenue | TB | ❌ Chưa làm | ~70% reads |
| 6 | localStorage thay sessionStorage presence | Thấp | ❌ Chưa làm | ~50% writes |
| 7 | Firebase App Check | Cao | ❌ Chưa làm | Chặn bot hoàn toàn |
| 8 | Budget alerts trên Firebase Console | Cao | ❌ Chưa làm | Cảnh báo sớm |

> [!IMPORTANT]
> **Biện pháp #7 (App Check)** là giải pháp toàn diện nhất — Google xác thực request đến từ app thật, không phải bot. Miễn phí, nhưng cần cấu hình reCAPTCHA v3.

> [!WARNING]
> **Biện pháp #8 (Budget alerts)** nên làm NGAY — vào Firebase Console → Usage & Billing → set alert ở $0 để nhận email khi bắt đầu tính phí. Không mất thời gian code.

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
⚠️ **Rủi ro lớn nhất**: trang `/search` và public writes không rate limit  
🛡 **Khuyến nghị**: Bật Budget Alert ngay + cân nhắc App Check khi traffic tăng
