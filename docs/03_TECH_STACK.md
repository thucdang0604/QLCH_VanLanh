# Tech Stack - Văn Lành Service Management System

Hệ thống quản lý cửa hàng sửa chữa điện thoại và laptop chuyên nghiệp, được tối ưu hóa cho hiệu suất cao (PageSpeed 90+) và khả năng mở rộng với AI.

## 1. Frontend Framework & Core Libraries
- **Framework**: [Next.js 15.1.4](https://nextjs.org/) (App Router architecture).
- **Language**: [TypeScript 5.x](https://www.typescriptlang.org/) (Strict mode).
- **UI Library**: [React 19](https://react.dev/).
- **Styling**: [Tailwind CSS 4.x](https://tailwindcss.com/) (JIT engine, utility-first).
- **Icons**: [Lucide React](https://lucide.dev/).
- **Components**: 
  - [Swiper 12](https://swiperjs.com/): Slider cho Hero Banners và Flash Sales.
  - [Sonner](https://sonner.stevenly.me/): Hệ thống thông báo (Toast).
  - [React Player](https://github.com/cookpete/react-player): Nhúng video sửa chữa/review.
  - [React Quill New](https://github.com/zenoamaro/react-quill): Editor rich-text cho viết bài tin tức.

## 2. Backend & Cloud Infrastructure (Firebase Suite)
- **Database (NoSQL)**: [Cloud Firestore](https://firebase.google.com/docs/firestore).
- **Realtime Database**: [Firebase RTDB](https://firebase.google.com/docs/database) (Dùng cho Chat, Hệ thống Presence, Live Tracking).
- **File Storage**: [Firebase Storage](https://firebase.google.com/docs/storage) (Region: `asia-southeast1` - Singapore).
- **Authentication**: [Firebase Auth](https://firebase.google.com/docs/auth) (Google Login, Email/Password, RBAC).
- **Serverless Functions**: [Firebase Functions](https://firebase.google.com/docs/functions) (Dành cho các tác vụ nền, trigger).
- **Hosting**: [Firebase Hosting](https://firebase.google.com/docs/hosting) kết hợp Cloud Run cho SSR (Next.js).

## 3. Artificial Intelligence (AI) Integration
- **LLM Engine**: 
  - **Google Gemini 1.5/2.0**: Sử dụng qua `@google/generative-ai` để tạo nội dung tin tức, hỗ trợ trả lời chat tự động.
  - **Ollama**: Hỗ trợ chạy các model AI local cho môi trường development hoặc admin tools đặc thù.
- **Features**: AI Auto-reply (RTDB), AI Article Creator.

## 4. Performance & Media Pipeline
- **CDN**: [Cloudflare](https://www.cloudflare.com/) (Edge caching, Security).
- **Image Pipeline**:
  - Custom `imageOptimizer.ts`: Chuyển đổi ảnh sang **WebP** trực tiếp ở trình duyệt/server bằng Canvas API.
  - Lazy Loading: Component `LazyImage` tự xây dựng, không dùng Next/Image mặc định để tránh vấn đề proxy trên Firebase Hosting.
  - Preconnect & Preload: Tối ưu hóa LCP cho các banner quan trọng.
- **Optimization**: ISR (Incremental Static Regeneration) cho các trang Category/Product/Article với on-demand revalidation qua API.

## 5. Dev Tools & Architecture Patterns
- **Architecture**:
  - **Customer-facing**: Server-Side Rendering (SSR) + React Server Components (RSC) cho SEO.
  - **Admin-facing**: Single Page Application (SPA) style với Realtime onSnapshot listeners.
- **Core Business Engines**:
  - **Inventory System**: Double-Entry bookkeeping (Stock vs Held). Sử dụng `increment()` atomic updates để ngăn chặn race conditions.
  - **Workflow Engine**: Dynamic State Machine. Trạng thái được định nghĩa trong Firestore, UI tự động render transitions và action buttons dựa trên `allowedNext` và `allowedFeatures`.
  - **Commission Engine**: Hierarchical Rule System. Tính toán hoa hồng realtime khi đạt checkpoint trạng thái, hỗ trợ refund (negative balance).
  - **Warranty Automator**: Rule-based stamping. Tự động tính toán ngày hết hạn dựa trên category linh kiện tại thời điểm đóng phiếu.
- **Custom Automation Scripts**: 
  - `generate-graph.js`: Tự động sinh bản đồ phụ thuộc file (`AI_FILE_MAP.md`).
  - `seed-data`: Các scripts populate dữ liệu mẫu cho testing.
  - `revalidate.ts`: On-demand ISR trigger cho Cloudflare/Next.js cache.
