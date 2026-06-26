# Giảm Tải Số Lượng Reads Firebase Trên Trang Chủ

Quá trình phân tích chuyên sâu cho thấy nguyên nhân cốt lõi gây ra khoảng 140 - 170 lượt reads Firebase mỗi khi tải lại trang (`F5`) xuất phát từ các thành phần gọi dữ liệu trực tiếp ở phía client (trong `useEffect`) và API phụ trợ.
Cụ thể, mỗi lượt refresh sẽ thực thi:
1. `page.tsx` (Server): ~16 reads (1 config + 15 products).
2. `PricingSection` qua API `/api/services/homepage-pricing`: ~140 reads (toàn bộ services active).
3. `ServiceBlock` (Client): 12 reads.
4. `FloatingReviews` (Client): 5 reads.
5. `ArticleBlock` (Client): 4 reads.
Tổng cộng khoảng ~177 reads mỗi lượt F5.

## User Review Required
> [!WARNING]
> Kế hoạch này sẽ cache dữ liệu trả về từ API `/api/services/homepage-pricing` (Bảng Giá Dịch Vụ ở trang chủ) trên Server trong **5 phút** (`revalidate = 300`). Điều này có nghĩa là khi admin cập nhật giá trị của một dịch vụ, có thể mất tối đa 5 phút để bảng giá trên trang chủ cập nhật (nhưng sẽ giảm 100-200 reads/refresh ngay lập tức). Nếu bạn muốn thời gian cache ngắn hơn (ví dụ 1 phút), xin hãy báo lại.
>
> Dữ liệu "Bài viết" (`ArticleBlock`), "Đánh giá" (`FloatingReviews`), và "Dịch vụ mới" (`ServiceBlock`) cũng sẽ được fetch chung một lần ở Server và truyền xuống Client để chặn hoàn toàn reads bên Client.

## Proposed Changes

### 1. Tối ưu Server-side Caching cho API Pricing

#### [MODIFY] `src/app/api/services/homepage-pricing/route.ts`
- Thêm `export const revalidate = 300;` để buộc Next.js App Router áp dụng ISR (Incremental Static Regeneration) cho kết quả trả về.
- Sửa đổi giúp giảm số lượng reads mỗi khi F5 trang từ `~140 reads` xuống `0 reads` (trong khoảng 5 phút giữa các lần cache).

---

### 2. Tích hợp Fetch Dữ Liệu SSR Ở Cấp Độ Trang

#### [MODIFY] `src/app/(customer)/page.tsx`
- Bổ sung `ssrLatestArticles`, `ssrLatestReviews`, và `ssrLatestServices` vào cấu trúc `SSRHomeConfig`.
- Mở rộng `Promise.all` trong `getHomeConfig` để fetch thêm 4 bài viết, 5 đánh giá và 12 dịch vụ thông qua Admin SDK. Điều này gom các query lại chạy đồng thời trên Server 1 lần duy nhất thay vì chạy trên trình duyệt người dùng.

#### [MODIFY] `src/app/(customer)/page.client.tsx`
- Nhận cấu hình bổ sung trong `ssrConfig` và truyền `ssrLatestArticles` xuống component `ArticleBlock`, `ssrLatestReviews` xuống `GoogleReviewsSection` (FloatingReviews), và `ssrLatestServices` xuống `ServiceBlock`.
- Cụ thể: Sửa đổi cách gọi Component động để chèn Props vào cho đúng:
  `{...(section.component === 'articles' ? { ssrLatestArticles: ssrConfig.ssrLatestArticles } : {})}`
  `{...(section.component === 'google_reviews' ? { ssrLatestReviews: ssrConfig.ssrLatestReviews } : {})}`

---

### 3. Tối ưu Components Client (Chặn Fetching Thừa)

#### [MODIFY] `src/components/home/ArticleBlock.tsx`
- Cập nhật Props để nhận `ssrLatestArticles`.
- Gán giá trị khởi tạo bằng `ssrLatestArticles`.
- Loại bỏ toàn bộ hook `useEffect` thực hiện `getDocs` trên client.

#### [MODIFY] `src/components/home/FloatingReviews.tsx`
- Cập nhật Props để nhận `ssrLatestReviews`.
- Gán giá trị khởi tạo bằng `ssrLatestReviews`.
- Loại bỏ hook `useEffect` thực hiện `getDocs` trên client.

#### [MODIFY] `src/components/home/ServiceBlock.tsx`
- Cập nhật Props để nhận `ssrLatestServices`.
- Gán giá trị khởi tạo bằng `ssrLatestServices`.
- Loại bỏ hook `useEffect` thực hiện `getDocs` trên client.

## Verification Plan

### Manual Verification
- Deploy hoặc chạy test trên Local với `npm run build` & `npm start`.
- Truy cập vào trang chủ và kiểm tra Network tab. Refresh nhiều lần.
- Đảm bảo trong tab console / firebase logs không còn các reads client-side không cần thiết từ `services`, `articles`, `reviews`.
- Trạng thái trang chủ hiển thị nguyên vẹn các thành phần dữ liệu.

---

## Báo Cáo Phụ: Rò Rỉ Reads Trên Trang Admin
Quá trình quét mã nguồn (audit) phần quản trị viên cho thấy có **4 điểm rò rỉ cực kỳ nguy hiểm** gây hao tổn lớn hạn mức Firebase (Quota) khi có nhân viên hoặc quản lý sử dụng:

### 1. Trang Báo Cáo Doanh Thu (`admin/revenue/page.tsx`) - VÙNG ĐỎ 🚨
- **Hiện tại:** Khi bảng tổng hợp (Aggregate) theo ngày chưa kịp khởi tạo (vd: xem doanh thu ngày hôm nay), hệ thống sẽ chạy cơ chế dự phòng (fallback): Gọi lệnh `getDocs` để lấy **TẤT CẢ** Đơn hàng, Sửa chữa, Nhập hàng, Hoa hồng, Chi phí trong vòng **6 tháng gần nhất**.
- **Hậu quả:** Nếu cửa hàng có 5.000 đơn hàng trong 6 tháng qua, thì **mỗi lần 1 nhân viên bấm vào trang Doanh thu, tài khoản Firebase của bạn mất ngay 5.000 lượt reads**.

### 2. Trang Quản lý Nhân Viên/Kỹ Thuật (`admin/technician/page.tsx`)
- **Hiện tại:** Có lệnh `getDocs(collection(db, 'users'))` để load danh sách nhân viên.
- **Hậu quả:** Kéo toàn bộ danh sách khách hàng (hàng ngàn người) về chỉ để lọc ra vài người là nhân viên (staff/admin).

### 3. Tab Khuyến Mãi (`admin/vouchers/DiscountRulesTab.tsx`)
- **Hiện tại:** Có lệnh `getDocs(collection(db, 'services'))`.
- **Hậu quả:** Tải toàn bộ bảng giá dịch vụ (hàng trăm/ngàn dịch vụ) về máy nhân viên mỗi khi vào cài đặt khuyến mãi.

### 4. Trang Dashboard Tổng Quan (`admin/page.tsx`)
- **Hiện tại:** Để đếm số lượng đơn hàng/doanh thu trong ngày, hệ thống quét toàn bộ đơn hàng có `updatedAt` trong ngày hôm nay.
- **Hậu quả:** Chi phí nhỏ (vài chục reads mỗi lần vào trang chủ Admin), nhưng nếu nhân viên F5 liên tục thì vẫn gây tích tiểu thành đại.

---

## Báo Cáo Phụ 2: Rò Rỉ Reads Trên Các Trang Chi Tiết & Danh Mục (Khách Hàng)
Sau khi quét tiếp các trang `product/[id]`, `service/[id]`, `tin-tuc/[slug]` và `category/[slug]`, tôi phát hiện thêm một lỗ hổng nghiêm trọng liên quan đến cách dùng hàm `cache()` của React:

### 1. Trang Chi Tiết Sản Phẩm (`product/[id]/page.tsx`) - VÙNG ĐỎ 🚨
- **Hiện tại:** Trang này dùng hàm `cache()` để bọc các lệnh lấy biến thể (Variants), lấy đánh giá (Reviews), lấy sản phẩm liên quan. Tuy nhiên, `cache()` của React **chỉ có tác dụng trong 1 lần tải trang của 1 người**, không lưu bộ đệm cho người tiếp theo! Thêm vào đó, hàm lấy biến thể gọi lệnh lấy 100 sản phẩm đang active về để lọc.
- **Hậu quả:** Mỗi lần 1 khách hàng mở xem 1 sản phẩm, Firebase bị trừ khoảng **129 lượt reads** (100 biến thể + 20 review + 8 liên quan + 1 chi tiết). 100 người xem sản phẩm = 12.900 reads!

### 2. Trang Danh Mục (`category/[...slug]/page.tsx`)
- **Hiện tại:** Dùng `unstable_cache` nhưng lại set thời gian hết hạn quá ngắn: `revalidate = 30` (30 giây). Lệnh query bên trong quét tối đa `limit(200)` dịch vụ.
- **Hậu quả:** Cứ mỗi 30 giây, máy chủ Next.js lại tự động gọi Firebase lấy 200 reads. Nếu chạy 2 máy chủ Cloud Run, bạn mất 400 reads/phút -> ~576.000 reads/ngày chỉ để duy trì bộ nhớ đệm danh mục!

## Đề Xuất Giải Pháp Cụ Thể (Phân Tách Client và Admin)

Hoàn toàn đồng ý với định hướng của bạn: **Khách hàng dùng Cache - Admin dùng Realtime**. Dưới đây là phương án kỹ thuật chi tiết cho từng phân hệ:

### 1. Giải pháp cho Trang Khách Hàng (Dùng Cache Tối Đa)
Vì khách hàng chỉ cần xem dữ liệu, và lượng truy cập rất lớn, ta sẽ dùng chiến lược **ISR (Incremental Static Regeneration)** kết hợp **On-Demand Revalidation**.

- **Trang chủ (`page.tsx`) & Client Components:**
  - Chuyển toàn bộ dữ liệu đang gọi ở Client (bảng giá, đánh giá, bài viết mới) sang gọi một lần ở Server (`page.tsx`) rồi truyền xuống qua Props.
  - Xóa cờ `force-dynamic`, thiết lập `revalidate = 3600` (1 tiếng) hoặc dùng `unstable_cache`.
- **Trang Chi Tiết & Danh Mục:**
  - Thay thế hàm React `cache()` bằng `unstable_cache` của Next.js để bộ nhớ đệm có tác dụng chéo cho mọi khách hàng.
  - **Sửa câu lệnh truy vấn:** Sửa lệnh lấy biến thể sản phẩm thành `where('categoryIds', 'array-contains', categoryId)` kết hợp `limit(10)`, tuyệt đối không tải 100 sản phẩm về RAM.
- **Vấn đề "Realtime" cho khách hàng:** Hệ thống của bạn đã có sẵn API `/api/revalidate`. Do đó, khi Admin cập nhật giá, thêm sản phẩm mới... ta chỉ cần gọi API này để "quét sạch" cache cũ. Giao diện khách hàng lập tức có dữ liệu mới mà không cần phải gọi Firebase liên tục.

### 2. Giải pháp cho Trang Admin (Không Cache - Tối ưu Query)
Admin cần dữ liệu chính xác 100% từng giây để vận hành (POS, xuất kho, duyệt đơn). Do đó, ta tối ưu trực tiếp vào câu lệnh Query để giảm số lượng read:

- **Báo cáo & Dashboard (`revenue/page.tsx`, `admin/page.tsx`):**
  - **Aggregate Documents (Cộng dồn):** Thay vì mỗi lần xem báo cáo phải quét hàng ngàn đơn hàng, ta sẽ tạo một collection `aggregates` (ví dụ: `daily_stats_2026_06_26`). Mỗi khi có đơn hàng hoàn tất, hệ thống tự động `increment(+1)` vào tài liệu này. Admin mở Dashboard chỉ tốn đúng **1 read** để lấy tổng doanh thu/số đơn.
  - Nếu Admin muốn xem danh sách chi tiết, bắt buộc sử dụng phân trang.
- **Tải danh sách & Dropdown (`technician`, `vouchers`, `suppliers`):**
  - **Quản lý nhân viên:** Thay vì quét toàn bộ bảng `users`, thêm index và dùng `where('role', 'in', ['staff', 'admin'])`.
  - **Dropdown chọn dịch vụ (Tab Khuyến mãi):** Không tải 500 dịch vụ một lúc. Sử dụng component **Autocomplete Search**: Chỉ lấy 20 dịch vụ đầu tiên. Khi Admin gõ tìm kiếm, gọi API `/api/search` (đã có sẵn cơ chế In-Memory) để tìm.
  - **Phân trang (Cursor Pagination):** Mọi bảng danh sách (Nhà cung cấp, Đơn hàng, v.v.) bắt buộc gắn `limit(20)` và dùng `startAfter(lastVisibleDoc)` khi bấm Next.

---

## Trình tự Thực Thi (Kế hoạch Đề xuất)
Tôi sẽ tiến hành sửa chữa theo thứ tự ưu tiên từ thiệt hại nặng nhất đến nhẹ nhất:

- [ ] **Giai đoạn 1: Vá lổ hổng Trang Khách Hàng (Ưu tiên cao nhất)**
  - Chuyển data fetch của Client lên Server ở Trang chủ.
  - Bật bộ nhớ đệm (Cache/ISR) cho Homepage, Category, Product Detail, Service Detail.
  - Tối ưu query Variants sản phẩm.
- [ ] **Giai đoạn 2: Tối ưu Danh sách Admin (Ưu tiên trung bình)**
  - Áp dụng `limit()` và Phân trang cho các trang quản lý Nhân sự, Nhà cung cấp, Khuyến mãi.
  - Tối ưu query lọc riêng `staff/admin` thay vì kéo toàn bộ user.
- [ ] **Giai đoạn 3: Báo cáo & Dashboard (Ưu tiên thấp - Khó nhất)**
  - Cài đặt cơ chế Aggregate (Bộ đếm tự động) cho Doanh thu và Đơn hàng.

Bạn vui lòng kiểm tra lại Kế hoạch (file `firebase_reads_optimization.md`). Nếu bạn đồng ý với chiến lược Phân tách Client/Admin này, hãy bấm **Proceed** hoặc phản hồi để tôi bắt đầu viết code cho **Giai đoạn 1**!
