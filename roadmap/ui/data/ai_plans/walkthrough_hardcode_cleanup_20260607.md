# Walkthrough: Hardcode Cleanup

**Kế hoạch tương ứng:** `plan_hardcode_cleanup_20260607.md`  
**Ngày hoàn thành:** 07/06/2026  
**Trạng thái:** Hoàn tất thực thi & Đã merge Master  

---

## 1. Những cải tiến đã thực hiện

### A. Bảo mật API Key Google Maps
*   **Thành quả:** Loại bỏ hoàn toàn Google Maps API key nhúng thô trong tệp giới thiệu cửa hàng [gioi-thieu/page.tsx](file:///m:/QLCH_VanLanh/src/app/(customer)/info/gioi-thieu/page.tsx).
*   **Giải pháp:** Chuyển sang sử dụng liên kết CTA Google Maps an toàn, trỏ trực tiếp theo tọa độ địa lý được lấy từ cấu hình chi nhánh hệ thống (`store_branches[0].mapLink`), triệt tiêu hoàn toàn nguy cơ lộ khóa API công khai.

### B. Storefront Không hiển thị Dữ liệu giả
*   **Thành quả:**
    1. Trình chiếu Banner [HeroSection.tsx](file:///m:/QLCH_VanLanh/src/components/home/HeroSection.tsx) và khối Dịch vụ [ServiceBlock.tsx](file:///m:/QLCH_VanLanh/src/components/home/ServiceBlock.tsx) được tái cấu trúc để ẩn hoàn toàn hoặc hiển thị thông báo thiết lập khi cơ sở dữ liệu Firestore trống/lỗi, loại bỏ các slide và dịch vụ demo cứng.
    2. Bảng đánh giá Google Reviews chỉ hiển thị các đánh giá thực tế lấy qua server-side proxy API. Khi gặp lỗi, hệ thống chỉ hiển thị nút kêu gọi đánh giá trên Maps chính thức, không tự sinh review ảo.

### C. Tập trung hóa Nhận diện Doanh nghiệp (Business Identity)
*   **Thành quả:** Gom toàn bộ các thông tin thương hiệu, số điện thoại hotline, email hỗ trợ, mạng xã hội và địa chỉ về một nguồn cấu hình duy nhất tại [businessIdentity.ts](file:///m:/QLCH_VanLanh/src/lib/businessIdentity.ts).
*   **Tác động:** Các thành phần giao diện dùng chung như Header, Footer, Mobile Navigation, ChatWidget và SEO metadata tự động đồng bộ theo cấu hình này, dễ dàng thay đổi thông tin toàn bộ trang web chỉ bằng 1 thao tác cấu hình.

### D. Chuẩn hóa Hằng số Trạng thái Nghiệp vụ (Workflow Constants)
*   **Thành quả:** 
    1. Đóng gói toàn bộ các chuỗi trạng thái linh kiện sửa chữa (`requested`, `ordered`, `selected`, `in_stock`, `rejected`, `cancelled`) và trạng thái phiếu sửa chữa (`dang_kiem_tra`, `cho_ban_giao_khach`, `done`, `refund`, `out`) vào helper có định kiểu rõ ràng [repairStatus.ts](file:///m:/QLCH_VanLanh/src/lib/repairStatus.ts).
    2. Xóa bỏ hoàn toàn logic kiểm tra quyền quản trị sơ sài dựa trên email (`email?.includes('admin')`), thay thế bằng hệ thống phân quyền vai trò (Role-Based Access Control) chặt chẽ trên cả client và server-side.

### E. Tách biệt Fixtures và Template
*   **Thành quả:** Di chuyển dữ liệu mẫu của biểu in hóa đơn bảo hành và các dòng dữ liệu Excel import ban đầu ra các tệp fixture độc lập, đảm bảo dữ liệu demo không bao giờ bị vô tình ghi đè vào các collection Firestore thực tế.

---

## 2. Kết quả kiểm chứng
*   **Mã nguồn sạch:** Kiểm tra bằng ESLint và TypeScript (`pnpm typecheck` và `pnpm lint`) hoàn toàn sạch bóng các lỗi hardcode hay ép kiểu bừa bãi.
*   **Vận hành:** Quy trình nghiệp vụ sửa chữa, xuất kho, và POS checkout hoạt động chính xác theo các hằng số trạng thái mới.
