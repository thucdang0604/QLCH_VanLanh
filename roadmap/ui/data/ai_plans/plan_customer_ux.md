# Kế hoạch Nâng cấp UX/UI Trang Khách Hàng (Customer Interface)

Dựa trên phản hồi và yêu cầu của anh/chị, em xin gửi chi tiết kế hoạch triển khai cho 4 hạng mục lớn để tối ưu giao diện thực tế và đặc biệt chú trọng vào giao diện Mobile.

## User Review Required

> [!IMPORTANT]
> **Tích hợp Google Maps Reviews:** Để lấy đánh giá tự động từ Google Maps, chúng ta sẽ cần một **Google Maps API Key** và **Place ID** của cửa hàng anh/chị. Em sẽ thiết lập sẵn khung code API và UI, anh/chị chỉ cần điền Key vào file `.env` sau khi code xong là hệ thống sẽ tự động kéo data về hiển thị.

> [!NOTE]
> **Tối ưu Mobile (Mobile-First):** Các thay đổi dưới đây đều được thiết kế ưu tiên hiển thị trên điện thoại. Bảng giá sẽ có dạng vuốt ngang (swipe), popup tra cứu sẽ hiển thị dạng Bottom Sheet (kéo từ dưới lên) trên mobile để dễ bấm bằng một tay.

## Proposed Changes

### 1. Popup Tra Cứu Đơn Hàng (Tracking Modal)
Thay vì chuyển hướng sang một trang khác, khi khách hàng bấm "Tra cứu" trên Header hoặc ở thanh điều hướng dưới cùng (Mobile Bottom Nav), một Popup sẽ trượt lên mượt mà (giống hiệu ứng của trang Rate).
*   **[MODIFY]** `src/components/layout/Header.tsx`
    *   Sửa nút "Tra cứu" để mở Modal thay vì chuyển trang (Link).
*   **[MODIFY]** `src/components/layout/MobileBottomNav.tsx`
    *   Cập nhật nút Tra cứu ở Bottom Bar trên điện thoại để mở Modal.
*   **[NEW]** `src/components/TrackingModal.tsx`
    *   Tạo form nhập Số điện thoại hoặc Mã phiếu.
    *   Sử dụng UI bo góc `rounded-3xl`, shadow lớn và animation `slide-in-from-bottom-8` như trang Rate.
    *   Trực tiếp call API kiểm tra và hiển thị tiến độ sửa chữa (Timeline) ngay trong Popup.

### 2. Gộp Chat Widget (Speed Dial)
Giải phóng không gian màn hình, đặc biệt là trên Mobile, bằng cách gộp 3 nút bong bóng chat lại.
*   **[MODIFY]** `src/components/ChatWidget.tsx`
    *   Tạo một nút Floating Action Button (FAB) duy nhất có biểu tượng Chat/Hỗ trợ.
    *   Khi click vào nút FAB, sẽ có hiệu ứng xoè ra (Pop-out) 3 nút nhỏ: **Zalo**, **Messenger**, và **AI Chatbot**.
    *   Nếu chọn Zalo/Messenger -> Mở link. Nếu chọn AI Chatbot -> Mở khung chat AI hiện tại.

### 3. Bảng Giá Sửa Chữa (Pricing Table Section)
Tạo một khối (Section) Bảng giá trực quan ngoài trang chủ để tăng độ tin cậy.
*   **[NEW]** `src/components/home/PricingSection.tsx`
    *   Tạo giao diện chia Tab theo thiết bị: `iPhone` | `iPad` | `MacBook` | `Samsung`.
    *   Bên trong mỗi Tab là một danh sách dạng lưới (Grid) hiển thị Dịch vụ + Giá tham khảo (Ví dụ: "Thay pin iPhone 13 Pro Max - 850.000đ").
    *   Trên Mobile, các thẻ giá sẽ hỗ trợ vuốt ngang (Carousel/Swipe) để không làm trang web quá dài.
*   **[MODIFY]** `src/app/(customer)/page.client.tsx` (Hoặc page.tsx)
    *   Chèn `PricingSection` vào cấu trúc trang chủ hiện tại.

### 4. Hiển thị Đánh giá từ Google Maps
Tích hợp tự động các bài đánh giá 5 sao từ Google Maps lên website.
*   **[NEW]** `src/app/api/reviews/google/route.ts`
    *   Tạo API route backend để gọi đến Google Places API, giúp giấu API Key an toàn và có cơ chế Cache dữ liệu (tránh gọi API của Google quá nhiều lần gây tốn phí).
*   **[NEW]** `src/components/home/GoogleReviewsSection.tsx`
    *   Giao diện hiển thị các thẻ Đánh giá (Avatar người dùng Google, Số sao, Nội dung comment).
    *   Sử dụng dạng Slider/Carousel cho Mobile để khách hàng lướt xem dễ dàng.
*   **[MODIFY]** `src/app/(customer)/page.client.tsx`
    *   Chèn `GoogleReviewsSection` vào trang chủ (nằm gần khu vực Footer).

### 5. Cố định thanh tìm kiếm trên Mobile (Mobile Search Header)
Mang thanh tìm kiếm trực tiếp ra ngoài header trên thiết bị di động để người dùng dễ nhìn thấy và sử dụng ngay lập tức thay vì giấu trong Hamburger Menu.
*   **[MODIFY]** `src/components/layout/Header.tsx`
    *   Tách thanh tìm kiếm khỏi menu ẩn.
    *   Thiết kế thành một hàng (row) riêng biệt, luôn hiển thị bên dưới dòng Main Header khi lướt web bằng điện thoại.

## Verification Plan

### Manual Verification
1. **Tra cứu Modal:** Bấm "Tra cứu", kiểm tra hiệu ứng Pop-up và nhập thử SDT có thật trong database xem Timeline hiển thị đúng không.
2. **Speed Dial Chat:** Kiểm tra góc phải dưới trên giả lập Mobile, bấm vào nút Chat chính xem 3 nút con có bay ra mượt mà và đúng vị trí không.
3. **Responsive UI:** Co giãn màn hình trình duyệt (Desktop -> Mobile) để đảm bảo Bảng giá và Google Reviews vuốt ngang được trên màn hình nhỏ.
