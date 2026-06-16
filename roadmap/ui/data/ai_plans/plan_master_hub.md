# Tích hợp Master Hub Workflow & Tối Ưu Hiển Thị

**Status:** completed

## Mục tiêu
1. **Sửa lỗi hiển thị**: Xử lý tình trạng sơ đồ (workflow) bị nhỏ, che lấp và không hiển thị full màn hình.
2. **Xây dựng Sơ đồ Master Hub**: Tạo một siêu sơ đồ (Unified Master Diagram) bao gồm toàn bộ các luồng (Kho, POS, Sửa chữa, Tài chính, Hệ thống) và các điểm giao nhau (cross-links) giữa chúng.
3. **Hiệu ứng Highlight Tương Tác**: Khi click vào một node bất kỳ trên sơ đồ Master Hub, toàn bộ các node và mũi tên (edges) liên quan trong flow đó sẽ sáng lên, các node khác sẽ bị mờ đi để người dùng dễ dàng theo dõi đường đi của dữ liệu.

> [!IMPORTANT]
> **Yêu cầu phê duyệt**: Sơ đồ Master Hub sẽ rất lớn (gần 100 nodes). Khi nối toàn bộ lại với nhau, Mermaid có thể render ra một sơ đồ cực kỳ phức tạp. Tôi sẽ sắp xếp chúng thành các `subgraph` (cụm) rõ ràng, và tính năng Highlight sẽ là mấu chốt để "gỡ rối" sơ đồ này. Bạn xem xét giải pháp dưới đây nhé.

---

## Các thay đổi đề xuất

### 1. Tối ưu CSS Layout (Hiển thị Sơ đồ)
#### [MODIFY] `styles.css`
- Chuyển `#content-container` thành `display: flex; flex-direction: column;` để xử lý chiều cao động.
- Sửa class `.dashboard-view` và `.workflow-view` để đảm bảo chúng kế thừa đúng 100% không gian trống thay vì bị bóp nghẹt.
- Sửa lại chiều cao của `.mermaid svg` để nó luôn fill đúng kích thước của `panZoom` wrapper.

### 2. Thiết kế Unified Master Diagram
#### [MODIFY] `data/workflows.json`
- Thay thế luồng `master` hiện tại (đang chỉ là các ô vuông rời rạc) thành một sơ đồ Mermaid tổng hợp, bê nguyên nội dung của các luồng nhỏ ráp lại thành một sơ đồ siêu lớn.
- Sử dụng cấu trúc `subgraph` cho từng module để giữ cho sơ đồ được phân vùng tốt.
- Gắn thêm event `click` vào toàn bộ các node trong sơ đồ này, trỏ đến hàm `handleMasterNodeClick("node_id")` trong JS.

### 3. Thuật toán Trace & Highlight trên SVG (Tương tác)
#### [MODIFY] `app.js`
- Thêm logic DOM traversal (duyệt DOM SVG) cho biểu đồ Mermaid.
- Khi người dùng click vào một node, hệ thống sẽ:
  1. Tìm class `node` tương ứng trong file SVG.
  2. Tra ngược/xuôi qua các đường kẻ `.edgePaths` và các `edgeTerminals` để tìm ra tất cả các node kết nối với nó.
  3. Thêm class `.highlighted` cho các phần tử thuộc luồng này, và class `.dimmed` cho các phần tử không liên quan.
  4. Thêm CSS động vào trong view để xử lý opacity và drop-shadow phát sáng cho đường line.
- Bổ sung nút "Tắt Highlight" (Clear Highlight) trên thanh công cụ `view-controls`.

---

## Kế hoạch Xác minh (Verification Plan)

### Kiểm tra bằng mắt (Manual UI Check)
- Mở lại trang Dashboard, chuyển sang các Tab Workflow (Kho, POS...) để xem biểu đồ đã bung to ra chưa, có cuộn và zoom bằng chuột bình thường không.
- Chuyển sang Tab "Master Hub". Xem sơ đồ tổng quan.
- Click thử vào một chức năng (VD: "🔗 Đơn Hàng Online"), quan sát xem biểu đồ có mờ đi và làm sáng rõ đường đi của "Đơn Hàng Online" xuyên suốt sang đến "Trừ Kho" và "Tài Chính" hay không.

### Các câu hỏi mở (Open Questions)
> [!NOTE]
> 1. Sơ đồ Master Hub nếu gom hết 100% chi tiết có thể rất "chi chít". Tôi dự định sẽ gộp cả 5 module vào, nếu quá rối, tôi sẽ bỏ bớt các node ghi chú rườm rà (ví dụ các log bug) ra khỏi sơ đồ Master Hub, chỉ giữ luồng dữ liệu chính thôi. Bạn có đồng ý không? (Các sơ đồ chi tiết từng module bên trong menu riêng vẫn sẽ giữ đầy đủ chi tiết).
> 2. Tính năng highlight tự động tìm đường (auto-trace) hoạt động tốt trên SVG của Mermaid, tuy nhiên đôi lúc các node gom cụm (subgraph) có thể hiển thị hơi lạ. Tôi sẽ tinh chỉnh nếu phát sinh.

Vui lòng cho tôi biết bạn có đồng ý triển khai theo kế hoạch này không, hoặc nếu bạn có muốn bổ sung gì thêm.
