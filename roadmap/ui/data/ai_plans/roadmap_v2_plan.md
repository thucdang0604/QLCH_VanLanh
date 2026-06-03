# Mục Tiêu

Chuyển đổi toàn bộ tài liệu tĩnh trong thư mục `roadmap/` hiện tại sang cấu trúc Single Page Application (SPA) Data-driven trong thư mục mới `roadmap_v2/`.
Cấu trúc mới sẽ lưu trữ toàn bộ dữ liệu (Bugs, sơ đồ Mermaid) dưới dạng file JSON. `index.html` sẽ là trang duy nhất chịu trách nhiệm `fetch()` dữ liệu và render động.

Điều này mang lại lợi ích kép:

1. **Đối với AI:** Tối ưu hóa lượng token khi đọc file, chỉ cần đọc file `.json` nhẹ nhàng, nắm bắt ngữ cảnh nhanh chóng.
2. **Đối với Người dùng:** Trải nghiệm chuyển trang mượt mà không cần load lại, tập trung tất cả vào 1 nơi.

## User Review Required

> [!IMPORTANT]
>
> - Sau khi tôi thiết lập xong `roadmap_v2/`, thư mục `roadmap/` cũ vẫn sẽ được giữ nguyên để bạn đối chiếu. Khi bạn xác nhận mọi thứ ở bản v2 đã hoàn hảo, chúng ta mới cân nhắc xóa/thay thế bản cũ.
> - Bạn có đồng ý với giao diện kiểu "Dashboard tổng hợp" (Menu bên trái, Nội dung bên phải) cho `index.html` mới không?

## Open Questions

> [!NOTE]
> Về phần Bug Details (chi tiết bug), hiện tại nó nằm trong `bug-details.html`. Việc chuyển toàn bộ nội dung HTML dài dòng (triệu chứng, cách fix) vào JSON có thể làm JSON hơi dài. Tuy nhiên, vì mục tiêu là tối ưu cho AI, tôi đề xuất vẫn gom nội dung chi tiết bug vào file `data/bugs.json` hoặc lưu thẳng vào `manifest.json`. Bạn có đồng ý không?

## Proposed Changes

### Thay Đổi Cấu Trúc Thư Mục Mới (`roadmap_v2/`)

#### [NEW] `roadmap_v2/data/manifest.json`

- Copy nguyên trạng từ `roadmap/manifest.json`. Đây là file chứa tổng quan dự án, danh sách bug, trạng thái hoàn thành.

#### [NEW] `roadmap_v2/data/workflows.json`

- File JSON mới, chứa chuỗi text định nghĩa biểu đồ Mermaid được bóc tách từ các file HTML cũ (pos, inventory, repair, finance, v.v.).
- Định dạng dự kiến:

```json
{
  "pos-orders": {
    "title": "🛍️ Workflow POS & Đơn Hàng Chi Tiết",
    "mermaid": "graph TD\n subgraph POS [Bán Hàng Tại Quầy - POS]\n ..."
  },
  "inventory": { ... }
}
```

#### [NEW] `roadmap_v2/index.html`

- File HTML duy nhất (Single Page).
- Import thư viện `mermaid.min.js`, `svg-pan-zoom`, Tailwind CSS (nếu cần) hoặc custom CSS.
- Chứa Layout chia làm 2 phần: Sidebar (Menu) và Main Content.

#### [NEW] `roadmap_v2/styles.css`

- File CSS chứa các style cho layout mới, các nút bấm, và khung chứa sơ đồ.
- Sẽ kế thừa các thiết kế Dark mode đẹp mắt từ bản cũ.

#### [NEW] `roadmap_v2/app.js`

- Script điều khiển toàn bộ logic SPA.
- Các hàm: `loadDashboard()`, `loadWorkflow(id)`, `loadBugDetails(id)`.
- Tự động gọi `mermaid.run()` khi render xong HTML chứa biểu đồ.

## Verification Plan

### Tự Động / Thủ Công

1. Mở `roadmap_v2/index.html` trên trình duyệt local.
2. Kiểm tra xem màn hình Dashboard mặc định có hiển thị đúng tiến độ và danh sách bug từ `manifest.json` không.
3. Click vào các menu Workflow (POS, Inventory, Repair...). Xác minh rằng biểu đồ Mermaid được vẽ lên động mà không tải lại trang.
4. Xác minh chức năng Zoom In/Out/Reset View vẫn hoạt động hoàn hảo trên biểu đồ động.
5. Kiểm tra AI File Map hoặc hỏi AI đọc thông tin, xem AI có đọc từ file JSON một cách mượt mà không.
