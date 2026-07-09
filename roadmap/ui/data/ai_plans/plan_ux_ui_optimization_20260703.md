# Kế hoạch Tối ưu UX/UI toàn diện

**Ngày lập:** 03.07.2026
**Trạng thái:** Phân tích (Analysis) / Chờ duyệt (Pending)

## Mục tiêu
Dựa trên đợt audit UX/UI ngày 03.07.2026, ghi nhận và lên kế hoạch xử lý các điểm nghẽn về trải nghiệm người dùng (UX) và giao diện (UI) trên cả hai phân hệ: Khách hàng (Storefront) và Quản trị (Admin). Mục tiêu là tạo ra một trải nghiệm mượt mà, "mobile-first", loại bỏ cuộn ngang và tối ưu tốc độ cảm nhận (perceived performance).

## 1. Phân hệ Quản trị (Admin Dashboard)

### Vấn đề và Giải pháp
1. **Thiếu Responsive Layout (Thẻ Card) ở các trang còn lại**
   - *Hiện trạng:* Các trang như Khách hàng (`customers`), Sửa chữa (`repairs`), Dịch vụ (`services`), Mã giảm giá (`vouchers`) chỉ sử dụng bảng (Table) `overflow-x-auto`. Trên điện thoại phải vuốt ngang rất khó chịu.
   - *Giải pháp:* Tái cấu trúc layout: Ẩn Table trên Mobile/Tablet (`hidden lg:block`), và bổ sung danh sách dạng Thẻ (Cards) cho Mobile (`lg:hidden`).
2. **Hiệu ứng tải dữ liệu (Loading State) chưa tốt**
   - *Hiện trạng:* Đang dùng vòng xoay tròn (Spinner) tĩnh ở giữa màn hình.
   - *Giải pháp:* Thay thế bằng Skeleton Loading (khung xương mờ) để duy trì cấu trúc trang trong lúc chờ dữ liệu, tạo cảm giác tải nhanh hơn.
3. **Trạng thái rỗng (Empty States) sơ sài**
   - *Hiện trạng:* Chỉ hiển thị dòng text "Không tìm thấy dữ liệu".
   - *Giải pháp:* Thiết kế lại cụm Empty State có hình minh họa (Illustration) + Text mô tả + Nút Call-To-Action (VD: "Tạo khách hàng mới").
4. **Form Modals trên Mobile bị che khuất**
   - *Hiện trạng:* Các popup dài khiến nút "Lưu" bị đẩy xuống tít dưới cùng, dễ bị bàn phím ảo che khuất.
   - *Giải pháp:* CSS `sticky bottom-0 bg-white` cho khu vực chứa các Action Buttons để luôn hiển thị trên màn hình.

## 2. Phân hệ Khách hàng (Storefront)

### Vấn đề và Giải pháp
1. **Điều hướng Mobile (Mobile Navigation)**
   - *Hiện trạng:* Dùng Hamburger menu ở góc trên cùng, khó với ngón tay trên các điện thoại màn hình dài.
   - *Giải pháp:* Triển khai Bottom Navigation Bar cố định ở cạnh dưới màn hình với 4 tab: Trang chủ, Sản phẩm, Giỏ hàng, Tài khoản.
2. **Micro-interactions (Hiệu ứng phản hồi)**
   - *Hiện trạng:* Thao tác Thêm vào giỏ hoặc Gửi liên hệ chỉ có Toast thông báo tĩnh.
   - *Giải pháp:* Thêm animation vào biểu tượng giỏ hàng (Scale/Bounce) và Spinner Loading bên trong các nút bấm Call-To-Action khi đang fetch.
3. **Tối ưu ảnh (Image Loading)**
   - *Hiện trạng:* Banner và ảnh load đôi khi gây giật khung hình (Layout Shift).
   - *Giải pháp:* Thêm cơ chế blur-up placeholders cho `Next/Image`.
4. **Sticky Call-To-Action**
   - *Hiện trạng:* Nút Đặt lịch bị trôi đi khi khách lướt đọc chi tiết.
   - *Giải pháp:* Thêm thanh Bar nhỏ dưới đáy màn hình chứa nút "Đặt lịch ngay" dính chặt (sticky) khi khách xem trang chi tiết dịch vụ/sản phẩm.

## Kế hoạch triển khai (Phân chia Task)
- **Giai đoạn 1 (Ưu tiên):** Cập nhật Card Layout cho các trang Admin còn sót lại (`customers`, `repairs`, `services`). Đảm bảo 100% trang quản trị chuẩn Responsive không cuộn ngang.
- **Giai đoạn 2:** Áp dụng Skeleton Loading và nâng cấp Form Modals (sticky bottom) cho toàn bộ hệ thống Admin.
- **Giai đoạn 3:** Xây dựng Bottom Navigation Bar và bổ sung Micro-interactions cho trang Khách hàng (Storefront).

## Phạm vi file dự kiến (Scope)
- `src/app/admin/customers/page.tsx`
- `src/app/admin/repairs/page.tsx`
- `src/app/admin/services/page.tsx`
- `src/components/layout/MobileBottomNav.tsx`
- `src/components/ui/Skeleton.tsx`
- `src/app/(customer)/layout.tsx`
