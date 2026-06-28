# Walkthrough: Service Variants

## Admin Flow

1. Vào `/admin/services`.
2. Gán đúng taxonomy danh mục cho từng dịch vụ.
3. Các dịch vụ có cùng deepest `categoryIds` sẽ tự hiển thị cùng nhóm biến thể phía khách.

## Customer Flow

1. Mở `/service/[id]` của một dịch vụ có `categoryIds`.
2. Trang server lấy deepest category id và fetch các dịch vụ active cùng category.
3. `ServiceDetailClient` hiển thị card biến thể ở cột phải phía trên form đặt lịch, gồm dòng máy hoặc tên dịch vụ, giá, thời gian sửa nếu có.
4. Card đang xem được đánh dấu active; card khác link sang `/service/{slug-or-id}`.
5. Trong form đặt lịch, bấm `Chọn ngày` để mở calendar tháng, dùng nút tháng trước/sau để chọn ngày xa hơn, rồi bấm ngày mong muốn.
