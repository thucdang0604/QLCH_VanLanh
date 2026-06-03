# Hoàn Tất Chuyển Đổi Sang Roadmap V2 (SPA)

Tôi đã hoàn thành việc di chuyển toàn bộ dữ liệu từ `roadmap/` cũ sang thư mục `roadmap_v2/` với cấu trúc Single Page Application mới.

## Cấu trúc thư mục mới:

```text
m:/QLCH_VanLanh/roadmap_v2/
├── data/
│   ├── manifest.json       # Chứa toàn bộ thông tin dự án, danh sách và chi tiết Bug
│   └── workflows.json      # Chứa chuỗi text Mermaid của tất cả các luồng quy trình
├── index.html              # Shell HTML duy nhất
├── styles.css              # Giao diện Dark mode + Dashboard layout
└── app.js                  # Logic gọi API fetch() data và render ra màn hình
```

## Các tính năng nổi bật:

1. **Dashboard Tổng Quan**: Liệt kê trực tiếp tỷ lệ hoàn thành, tổng số bug đang mở và hiển thị danh sách chi tiết ngay ngoài màn hình chính. Bấm vào mỗi bug sẽ nhảy vào xem chi tiết của bug đó mà không cần tải lại trang.
2. **Workflows Sơ Đồ Động**: Tất cả các luồng POS, Sửa Chữa, Kho Hàng... đều được vẽ động thông qua thư viện `mermaid.js` dựa trên data trong `workflows.json`. Các nút Zoom/Pan vẫn hoạt động hoàn hảo.
3. **AI-Friendly**: Với cấu trúc mới này, khi cần đọc thông tin dự án, AI chỉ cần lướt qua hai file `data/manifest.json` và `data/workflows.json`. Siêu nhẹ và siêu tiết kiệm token!

> [!WARNING]
> Vì trang web SPA này sử dụng hàm `fetch()` để đọc file `.json` local, trình duyệt (Chrome/Edge) mặc định chặn hành vi này vì lý do bảo mật CORS khi bạn mở bằng đường dẫn `file:///`.
> 
> **Cách mở:** Hãy mở bằng extension **Live Server** trên VS Code (click chuột phải vào `index.html` > Open with Live Server), trang web sẽ hoạt động hoàn hảo!
