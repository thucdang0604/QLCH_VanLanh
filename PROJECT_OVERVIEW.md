# Văn Lành Repair Center - Project Overview

## 📋 Tổng Quan Dự Án

**Tên:** Văn Lành Services (trước đây: Văn Lành Store)  
**Mục tiêu:** Hệ thống Web thương mại điện tử kết hợp Quản lý Trung tâm Sửa chữa (Mini-ERP/CRM), lấy cảm hứng từ CareK.vn  
**Live URL:** https://qlch-vanlanh.web.app

### Tech Stack

| Công nghệ | Phiên bản | Mục đích |
|-----------|-----------|----------|
| Next.js | 16.x | Framework React với App Router |
| TypeScript | 5.x | Type safety |
| Tailwind CSS | 3.x | Styling utility-first |
| Firebase Auth | - | Authentication (Email/Password + Google) |
| Firebase Firestore | - | Database chính |
| Firebase Realtime DB | - | Live Chat real-time + Online Counter |
| Firebase Storage | - | Image/Video upload (products, services, repairs, reviews) |
| Firebase Hosting | - | Deploy & hosting |
| Google Gemini API | - | AI chatbot (RAG + memory) & content generator |
| Lucide React | - | Icon library |
| react-quill-new | - | Rich Text Editor cho CMS bài viết |

---

## 🏗️ Cấu Trúc Dự Án

```
src/
├── app/                             # Next.js App Router pages
│   ├── (customer)/                  # Customer Frontend (ẩn danh, không cần đăng nhập)
│   │   ├── layout.tsx               # Customer layout (Header + Footer + ChatWidget + FloatingReviews)
│   │   ├── page.tsx                 # Homepage
│   │   ├── cart/                    # Giỏ hàng
│   │   ├── category/[slug]/         # Trang danh mục sản phẩm
│   │   ├── checkout/                # Thanh toán
│   │   ├── flash-sale/              # Flash sale
│   │   ├── product/[id]/            # Chi tiết sản phẩm + VideoEmbed
│   │   ├── search/                  # Tìm kiếm sản phẩm
│   │   ├── service/[id]/            # Chi tiết dịch vụ + Booking + VideoEmbed
│   │   ├── tracking/                # Tra cứu phiếu sửa chữa bằng SĐT + Inline Review
│   │   ├── tin-tuc/                 # Listing bài viết
│   │   │   └── [slug]/             # Chi tiết bài viết + VideoEmbed + prose HTML rendering
│   │   ├── rate/                    # QR Code đánh giá (public URL)
│   │   ├── reviews/                 # Tổng hợp đánh giá khách hàng
│   │   └── info/                    # Trang thông tin chính sách
│   │       ├── layout.tsx           # Info layout chung
│   │       ├── gioi-thieu/          # Giới thiệu cửa hàng
│   │       ├── chinh-sach-bao-hanh/ # Chính sách bảo hành
│   │       ├── chinh-sach-bao-mat/  # Chính sách bảo mật
│   │       ├── chinh-sach-doi-tra/  # Chính sách đổi trả
│   │       ├── chinh-sach-mua-hang/ # Chính sách mua hàng
│   │       └── tra-gop/             # Thông tin trả góp
│   ├── admin/                       # Admin Dashboard (Protected - RBAC)
│   │   ├── layout.tsx               # Admin layout + auth guard + RBAC + Sidebar Groups
│   │   ├── login/                   # Trang đăng nhập admin
│   │   ├── page.tsx                 # Dashboard (Online Users + Visits Today + Stats)
│   │   ├── products/                # CRUD sản phẩm + image upload
│   │   ├── services/                # CRUD dịch vụ sửa chữa
│   │   ├── repairs/                 # Quản lý phiếu sửa chữa (State Machine + Payment Gate)
│   │   ├── technician/              # Trang KTV: Kanban + List (staff view, ẩn giá, ẩn done)
│   │   ├── appointments/            # Quản lý lịch hẹn sửa chữa
│   │   ├── orders/                  # Quản lý đơn hàng (real-time Firebase)
│   │   ├── pos/                     # Bán hàng tại quầy (POS)
│   │   ├── inventory/               # Nhập hàng (radio retail/component + text tự do)
│   │   │   └── stock/               # Tồn kho tổng hợp (sortable table)
│   │   ├── revenue/                 # Báo cáo doanh thu (admin only)
│   │   ├── commissions/             # Hoa hồng 3 cấp (Chung → Danh mục → SP)
│   │   ├── staff/                   # Quản lý nhân viên (admin only)
│   │   ├── articles/                # CMS bài viết (ReactQuill + video embed)
│   │   ├── reviews/                 # Quản lý đánh giá khách hàng
│   │   ├── chat/                    # Live Chat + AI Bot toggle
│   │   ├── ai-creator/              # Tạo content với AI Gemini
│   │   ├── appearance/              # Quản lý giao diện (admin only)
│   │   └── settings/                # Cài đặt hệ thống (admin only)
│   │       └── repairs/             # Cài đặt trạng thái sửa chữa (State Machine Node Editor)
│   ├── api/                         # API Routes
│   │   ├── ai/                      # Gemini AI endpoint (RAG + conversation history)
│   │   ├── checkout/                # Tạo đơn hàng
│   │   ├── products/                # GET products
│   │   ├── seed-admin/              # Seed admin account
│   │   └── seed-config/             # Seed system_config
│   ├── layout.tsx                   # Root layout + AuthProvider + ConfigProvider
│   └── globals.css                  # Global styles
├── components/
│   ├── home/                        # Homepage sections
│   │   ├── HeroSection.tsx          # Banner slider (auto-play + side banners)
│   │   ├── FlashSale.tsx            # Countdown + product grid
│   │   ├── ServiceBlock.tsx         # Danh mục dịch vụ sửa chữa
│   │   ├── ServiceCard.tsx          # Card dịch vụ riêng lẻ
│   │   ├── BookingSection.tsx       # Form đặt lịch sửa chữa
│   │   └── FloatingReviews.tsx      # Widget đánh giá nổi bật (auto-scroll)
│   ├── layout/
│   │   ├── Header.tsx               # Header + Mega Menu (2 cụm: Bán lẻ & Sửa chữa)
│   │   ├── Footer.tsx               # Footer + newsletter
│   │   └── MobileBottomNav.tsx      # Thanh điều hướng mobile (sticky bottom)
│   ├── admin/
│   │   ├── NotificationBell.tsx     # Thông báo (2 tabs: Tổng quan + Hoạt động)
│   │   └── MediaManager.tsx         # Quản lý media (upload/delete images)
│   ├── common/
│   │   └── Container.tsx            # Reusable container wrapper
│   ├── ui/
│   │   ├── Skeleton.tsx             # Loading skeletons + shimmer
│   │   └── LazyImage.tsx            # Lazy loading images (next/image)
│   ├── AuthModal.tsx                # Login/Register modal (admin/staff only)
│   ├── ChatWidget.tsx               # Multi-channel Contact (Zalo + Messenger + AI Chatbot)
│   └── VideoEmbed.tsx               # YouTube/Facebook iframe embed component
├── lib/
│   ├── firebase.ts                  # Firebase init (db, storage, rtdb, auth)
│   ├── firestore.ts                 # Firestore CRUD functions (typed)
│   ├── storage.ts                   # Firebase Storage - Image/Video upload/delete
│   ├── useFirestore.ts              # Custom hooks (useFirestoreCollection, useProducts, etc.)
│   ├── AuthContext.tsx              # Auth context + provider (login, signup, Google, RBAC)
│   ├── ConfigContext.tsx            # Dynamic site config context (colors, banners, branches)
│   ├── CartContext.tsx              # Cart state management
│   ├── realtimedb.ts               # Realtime DB for chat
│   ├── gemini.ts                    # Gemini AI client
│   └── types.ts                     # TypeScript interfaces (updated with all new features)
└── scripts/
    └── seed-admin.js                # Script tạo admin account đầu tiên
```

---

## 🔄 Kiến Trúc Nghiệp Vụ Nâng Cao

### 1. State Machine — Quy trình Sửa chữa

Hệ thống trạng thái đã **chuyển từ mảng 1 chiều sang Node Graph** có `allowedNext[]`:

```
system_config/repairs.statuses = [
  { id: 'cho_tiep_nhan', label: 'Chờ tiếp nhận', allowedNext: ['dang_kiem_tra', 'out'] },
  { id: 'dang_kiem_tra', label: 'Đang kiểm tra', allowedNext: ['da_bao_gia', 'hoan_phi'] },
  { id: 'da_bao_gia', label: 'Đã báo giá', allowedNext: ['doi_khach_phan_hoi'] },
  ...
  { id: 'done', label: 'Chờ bàn giao', isTerminal: true, allowedNext: ['da_tra_may', 'hoan_phi', 'out'] },
  { id: 'da_tra_may', label: 'Đã trả máy', isTerminal: true },
  { id: 'hoan_phi', label: 'Hoàn phí', isTerminal: true },
  { id: 'out', label: 'Out', isTerminal: true },
]
```

- **Admin cấu hình** tại `/admin/settings/repairs`: drag-reorder, thêm/sửa/xóa, chọn màu, set `allowedNext`.
- **KTV chỉ thấy nút status phù hợp** theo `allowedNext` của trạng thái hiện tại.
- **Trang KTV** lọc bỏ `done` + terminal statuses → chỉ hiện phiếu đang cần xử lý.

### 2. Tracking Groups — Tra cứu Khách hàng

Khách hàng tra cứu phiếu sửa qua SĐT tại `/tracking`. Thay vì xem từng status chi tiết:

- Hệ thống gom statuses thành **Nhóm tra cứu (Tracking Groups)** do Admin cấu hình.
- **Thời gian bị ẩn hoàn toàn** trước khách → giảm áp lực cho KTV.
- Khách chỉ thấy: tên nhóm + progress bar + media bàn giao + nút đánh giá.

### 3. Payment Gate — Chốt chặn Bàn giao

Khi Admin/Lễ tân bấm nút Terminal (`Hoàn tất đơn` / `Hoàn phí` / `Out`):

- Modal **Handover Financial** bắt buộc hiện lên.
- Hiển thị số liệu tài chính: tổng chi phí, đã cọc, còn phải thu/hoàn.
- **Checkbox bắt buộc** "Tôi xác nhận đã thu đủ số tiền còn lại" khi chưa thanh toán.
- Nút `Out` bị disable nếu khách đã cọc → bắt buộc `Hoàn phí` thay thế.
- Cập nhật `payment.status` (`paid` / `refunded` / `pay_later`) trước khi đổi trạng thái terminal.

### 4. Hệ thống Đánh giá (Review)

- **QR Code** đánh giá tại `/rate`: Khách quét QR → chọn sao + viết nội dung + upload ảnh.
- **Inline Review** trên trang `/tracking`: Sau khi đơn `da_tra_may`, khách có thể đánh giá trực tiếp.
- **Floating Widget** (`FloatingReviews.tsx`): Hiển thị đánh giá mới nhất auto-scroll trên trang chủ.
- **Admin quản lý** tại `/admin/reviews`: Duyệt, xem, quản lý feedback.
- Upload ảnh review lưu vào Firebase Storage (`images/reviews/`), rules cho phép unauthenticated upload.

### 5. Multi-channel Contact Widget

`ChatWidget.tsx` nâng cấp từ 1 nút thành **cụm 3 nút nổi dọc** (bottom-right):

| # | Nút | Icon | Hành động |
|---|-----|------|-----------|
| 1 | Zalo | SVG xanh dương + pulse | Mở `zalo_link` từ config (new tab) |
| 2 | Messenger | SVG gradient xanh | Mở `facebook_link` từ config (new tab) |
| 3 | AI Chatbot | Orange gradient | Toggle cửa sổ chat AI (có delay 30s, bật/tắt bot) |

- Tooltip hiện bên trái khi hover.
- Links Zalo/Messenger lấy từ `useConfig().config.contact_info`.

### 6. AI Chatbot nâng cao

- **RAG (Retrieval-Augmented Generation)**: Bot tự query Firestore (products, services) để trả lời với giá cả, chi tiết dịch vụ real-time.
- **Memory**: Giữ lịch sử hội thoại để trả lời có ngữ cảnh.
- **System prompt** với kiến thức nghiệp vụ (giá, quy trình, chính sách).
- **Delay 30s**: Bot chỉ trả lời sau khi khách chờ 30s không có staff phản hồi.
- **Toggle bật/tắt** thủ công per session từ Admin Chat.

### 7. Admin Dashboard

- **Sidebar gom nhóm**: Tổng Quan, Bán Hàng, Dịch Vụ, Nhân Sự, Nội Dung, Hệ Thống.
- **Dashboard counters**:
  - 👤 Người online (Realtime DB `/online_users`)
  - 📊 Lượt truy cập hôm nay (Firestore `daily_visits`)
  - 📋 Tổng phiếu sửa, đơn hàng chờ, lịch hẹn chờ...

### 8. Kho & Hoa hồng

- **Nhập hàng** (`/admin/inventory`): Radio phân loại `Sản phẩm bán lẻ` / `Linh kiện sửa chữa` + text tự do search. **Hỗ trợ "Tạo mã mới" ngay tại dòng nhập**.
- **Tồn kho** (`/admin/inventory/stock`): Bảng tổng hợp sortable + visual alerts (hết/sắp hết). Tự động **ẩn "Linh kiện"** khỏi các view bán lẻ.
- **Hoa hồng 3 cấp** (`/admin/commissions`):
  - Cấp 1 (General): Mặc định cho tất cả.
  - Cấp 2 (Category): Theo danh mục sản phẩm.
  - Cấp 3 (Specific): Theo product ID cụ thể.
  - **Ưu tiên**: Cấp 3 → Cấp 2 → Cấp 1.

### 9. CMS Bài viết

- **Admin** (`/admin/articles`): CRUD với ReactQuill editor (`react-quill-new`, dynamic import `ssr: false`).
- **Toolbar**: `video`, `link`, `image`, `code-block` + formatting đầy đủ.
- Admin có **2 cách nhúng video**:
  1. Dùng nút Video trên toolbar → dán link YouTube → iframe inline trong bài.
  2. Dùng trường `videoEmbedUrl` → video hiện to đầu bài viết.
- **Customer** (`/tin-tuc/[slug]`): Render HTML bằng `dangerouslySetInnerHTML` + `prose prose-lg` + auto view count.
- **VideoEmbed** component (`VideoEmbed.tsx`): Extract YouTube ID → native `<iframe>`, hỗ trợ Facebook Video.

---

## 👥 Hệ Thống Phân Quyền (RBAC)

### Roles

| Role | Mô tả | Truy cập |
|------|--------|----------|
| `admin` | Quản trị viên toàn quyền | Toàn bộ Dashboard + Settings + Revenue + Staff |
| `staff` | Nhân viên | Orders, Repairs, Chat, Products, Services, Appointments, POS, Commissions, Technician |
| `customer` | Khách hàng (không đăng nhập web ngoài) | Chỉ giao diện `/(customer)` |

### AppUser Interface

```typescript
interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  phone?: string;
  role: 'admin' | 'customer' | 'staff';
  permissions?: string[];
}
```

### Staff Allowed Routes

```typescript
const staffAllowedRoutes = [
  '/admin/orders', '/admin/repairs', '/admin/chat',
  '/admin/products', '/admin/services', '/admin/appointments',
  '/admin/pos', '/admin/commissions', '/admin/technician',
];
```

**Lưu ý:** Khách hàng sử dụng web hoàn toàn **ẩn danh**, chỉ cung cấp SĐT khi cần Đặt lịch sửa chữa hoặc Tra cứu phiếu sửa chữa.

---

## 📱 Customer Frontend (`/(customer)`)

### 1. Header (`components/layout/Header.tsx`)

**Mega Menu chia 2 cụm:**
- **Sản phẩm bán lẻ:** Điện thoại, Laptop, Tablet, Phụ kiện, Smartwatch...
- **Dịch vụ sửa chữa:** Hiển thị theo slug: `sua-iphone`, `sua-samsung`, `thay-pin`, `ep-kinh`...

**Cấu trúc:**
- TopBar: USP messages (Chính hãng, Giao nhanh, Trả góp)
- MainHeader: Logo, Search bar, Hotline, Giỏ hàng (badge từ CartContext)
- Mega Menu: Categories + hover dropdown
- Responsive: hamburger menu trên mobile

### 2. MobileBottomNav

- Thanh điều hướng sticky bottom trên mobile
- Các mục: Trang chủ, Danh mục, Tìm kiếm, Giỏ hàng, Chat

### 3. Homepage

| Section | Component | Mô tả |
|---------|-----------|-------|
| Hero | `HeroSection.tsx` | Banner slider auto-play + side banners |
| Services | `ServiceBlock.tsx` | Danh mục dịch vụ sửa chữa + CTA |
| Flash Sale | `FlashSale.tsx` | Countdown timer + product grid |
| Booking | `BookingSection.tsx` | Form đặt lịch sửa chữa |
| Floating Reviews | `FloatingReviews.tsx` | Widget đánh giá khách hàng auto-scroll |

### 4. Tra Cứu Phiếu Sửa Chữa (`/tracking`)

- Khách nhập **SĐT** để tra cứu
- Hiển thị theo **Tracking Groups** (nhóm gộp, ẩn thời gian)
- Sau khi `da_tra_may`: hiện ảnh/video bàn giao + nút đánh giá inline
- Progress bar trực quan theo nhóm trạng thái

### 5. Multi-channel Contact

Cụm 3 nút nổi (bottom-right): Zalo + Messenger + AI Chatbot (xem mục 5 ở trên)

### 6. Rating & Reviews

- `/rate`: Form QR Code đánh giá (chọn sao, nội dung, upload ảnh)
- `/reviews`: Trang tổng hợp đánh giá
- Floating widget trên trang chủ

---

## 🔐 Admin Dashboard (`/admin`)

### Admin Sidebar Menu (Grouped)

| Group | Items | Quyền |
|-------|-------|-------|
| **Tổng Quan** | Dashboard | admin |
| **Bán Hàng** | Sản phẩm, Đơn hàng, POS, Nhập hàng, Tồn kho | admin/staff |
| **Dịch Vụ** | Sửa chữa, Kỹ thuật viên, Đặt lịch | admin/staff |
| **Nhân Sự** | Nhân viên, Hoa hồng, Doanh thu | admin |
| **Nội Dung** | Bài viết, Đánh giá, Live Chat, AI Creator | admin/staff |
| **Hệ Thống** | Giao diện, CĐ Sửa chữa, Cài đặt | admin |

### Quản Lý Phiếu Sửa Chữa (`/admin/repairs`)

**State Machine** với `allowedNext[]` (cấu hình tại `/admin/settings/repairs`)

**Thông tin phiếu:**
- Khách hàng (tên, SĐT)
- Thiết bị (model, passcode, IMEI, màu, ảnh, checklist kiểm tra 8 hạng mục)
- Media: `preRepairMedia[]` + `postRepairMedia[]`
- `statusTimeline[]`: Lịch sử trạng thái + duration mỗi khâu
- Thanh toán (`unpaid` / `deposit` / `paid` / `pay_later`) + Payment Gate
- Upload Video Bàn Giao (Camera button trên bảng ở status done)

### Khu Vực Kỹ Thuật Viên (`/admin/technician`)

- Kanban + List view cho staff
- **Ẩn**: giá tiền, thông tin tạo phiếu, phiếu `done` + terminal
- KTV chỉ thấy nút đổi trạng thái theo `allowedNext`

### CMS Bài viết (`/admin/articles`)

- ReactQuill editor (dynamic import, `ssr: false`)
- Toolbar: video, link, image, code-block, headings, formatting
- Trường `videoEmbedUrl` riêng cho video nổi bật đầu bài
- Type: News / Promo / Tips, Status: draft / published

---

## 📦 Data Layer

### TypeScript Types (`lib/types.ts`)

```typescript
// Repair Ticket
type RepairStatus = 'cho_tiep_nhan' | 'dang_kiem_tra' | 'da_bao_gia' | 'doi_khach_phan_hoi' 
  | 'tim_linh_kien' | 'da_dat_linh_kien' | 'dang_sua_chua' | 'done' 
  | 'da_tra_may' | 'hoan_phi' | 'out';
type PaymentStatus = 'unpaid' | 'deposit' | 'paid' | 'pay_later' | 'refunded';

interface RepairTicket {
  id: string;
  customer: { name: string; phone: string; };
  deviceInfo: { model: string; passcode: string; imei: string; color?: string; image?: string; checklist?: DeviceChecklist; };
  preRepairMedia: string[];
  postRepairMedia: string[];
  statusTimeline: StatusTimelineEntry[];
  issue: { description: string; notes: string; };
  payment: { status: PaymentStatus; partsCost: number; laborCost: number; amount: number; depositAmount: number; };
  staff: { createdBy: string; createdByName: string; assignedTechnician: string; assignedTechnicianName: string; };
  status: RepairStatus;
}

// Tracking Group (admin-configurable)
interface TrackingGroup {
  label: string;
  statuses: string[];
  isTerminal?: boolean;
}

// Product, Service, Article — all have optional videoEmbedUrl?: string
interface Product { /* ... */ videoEmbedUrl?: string; }
interface Service { /* ... */ videoEmbedUrl?: string; }
interface Article { /* ... */ videoEmbedUrl?: string; content: string; /* HTML */ }

// Commission Rule (3-tier)
interface CommissionRule {
  hierarchyLevel: 1 | 2 | 3;
  targetType: 'general' | 'category' | 'specific';
  targetValue?: string;
  percentage: number;
  fixedAmount?: number;
}
```

### Firestore Collections

| Collection | Mô tả |
|------------|--------|
| `products` | Sản phẩm bán lẻ |
| `services` | Dịch vụ sửa chữa |
| `appointments` | Lịch hẹn |
| `repairs` | Phiếu sửa chữa (State Machine, Payment Gate) |
| `orders` | Đơn hàng bán lẻ |
| `articles` | Bài viết CMS (HTML content, ReactQuill) |
| `reviews` | Đánh giá khách hàng |
| `users` | User profiles (admin, staff) |
| `subscribers` | Newsletter emails |
| `system_config` | Config: site, repairs (statuses + tracking groups) |
| `import_receipts` | Phiếu nhập hàng |
| `commission_rules` | Quy tắc hoa hồng 3 cấp |
| `commissions` | Lịch sử hoa hồng |
| `activities` | Hoạt động hệ thống |

### Realtime DB Structure

```
chats/{sessionId}/
  info/ (userName, status, lastMessage, hasUnread, botActive)
  messages/{msgId}/ (content, sender, timestamp)

online_users/{visitorId}/ (timestamp, lastActive)
```

---

## 🎨 Dynamic Config System (`ConfigContext.tsx`)

```typescript
interface SiteConfig {
  primaryColor: string;
  contact_info: ContactInfo; // SĐT, email, zalo_link, facebook_link
  siteName: string;
  hero_banners: HeroBanner[];
  background_config: BackgroundConfig;
  store_branches: StoreBranch[];
  homeSections: HomeSectionItem[];
}
```

---

## 🔧 Firebase Rules & Storage

### Storage Rules (`storage.rules`)
- `images/reviews/`: Cho phép unauthenticated upload (max 5MB, image only)
- Các path khác: yêu cầu auth

### Firebase Config Files
- `.firebaserc`: Project ID = `qlch-vanlanh`
- `firebase.json`: Hosting + Storage rules
- `firestore.rules`, `firestore.indexes.json`, `database.rules.json`

---

## 🚀 Commands

```bash
npm run dev          # Development (Turbopack)
npm run build        # Production build
npx tsc --noEmit     # Type check
firebase deploy --only hosting    # Deploy hosting
firebase deploy --only storage    # Deploy storage rules
```

---

## 📝 Quy Tắc Nghiệp Vụ Quan Trọng

1. **Luôn sử dụng** `useFirestoreCollection` hoặc các hàm CRUD trong `src/lib/firestore.ts`.
2. **Header Mega Menu** chia 2 cụm: **Sản phẩm bán lẻ** và **Dịch vụ sửa chữa**.
3. **Khách hàng ẩn danh** — Chỉ nhập SĐT khi đặt lịch hoặc tra cứu.
4. **Luồng Sửa chữa:** `appointments` → `repairs` → State Machine → Payment Gate → Terminal → Tracking + Review.
5. **Luồng Bán lẻ:** `products` → Cart → Checkout → `orders` → Admin quản lý. (POS tự động chặn bán khi hết hàng, support thêm nhanh SP).
6. **Mặt hàng:** "Linh kiện" bị tách biệt hoàn toàn khỏi POS và Bán lẻ, chỉ dùng cho Sửa chữa.
7. **AI Chatbot:** Gemini AI + RAG + Memory, delay 30s, toggle per session.
8. **ConfigContext:** Giao diện động quản lý qua `system_config` collection.
9. **Video Embed:** Dùng `VideoEmbed.tsx` (native iframe), KHÔNG dùng react-player.

---

## 📝 Feature History

### ✅ Phase 1 — Core
- [x] Firebase Auth + RBAC
- [x] Admin Login + Protected Routes
- [x] Firestore integration + Storage
- [x] Chat + AI Chatbot (Gemini)
- [x] Dynamic Config System
- [x] Repair Ticket Management
- [x] Appointment + Tracking
- [x] Staff Management + Revenue
- [x] Policy Pages + Newsletter
- [x] POS Module

### ✅ Phase 2 — ERP Upgrade
- [x] KTV page (Kanban + List), Upload Video, CĐ Sửa chữa
- [x] POS image fallback, Orders real-time
- [x] Nhập hàng (radio + text tự do), Tồn kho tổng
- [x] Chat fix (isAiTyping), Bot toggle
- [x] Notification Center (activities + mark-as-read)
- [x] Commission 3-tier hierarchy
- [x] 10 trạng thái + statusTimeline + checklist

### ✅ Phase 3 — UX & CMS Upgrade
- [x] State Machine (Node Graph + allowedNext)
- [x] Tracking Groups (gom nhóm, ẩn thời gian)
- [x] Payment Gate (Handover Financial Modal)
- [x] QR Rating + Inline Review + Floating Reviews
- [x] Multi-channel Contact (Zalo + Messenger + AI Chatbot)
- [x] AI RAG + Memory (chatbot nâng cao)
- [x] Dashboard Online Counter + Visits
- [x] Sidebar Groups
- [x] CMS Bài viết (ReactQuill + video embed)
- [x] VideoEmbed component (YouTube/Facebook iframe)
- [x] Admin Reviews management
- [x] **Inventory & POS UX**: Chặn tồn kho POS, Thêm nhanh SP tại POS, Tạo inline SP/Linh kiện tại Phiếu nhập. Tách biệt Linh kiện.

### 🔲 Future
- [ ] Email notifications
- [ ] Multi-language support
- [ ] PWA support
- [ ] Barcode/QR scanner cho POS
- [ ] Báo cáo xuất PDF
