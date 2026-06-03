# Task: Live Chat Omnichannel v2

**Nhánh**: `codex/chat-enhancements`  
**Cập nhật**: 26.05.2026

## Nền tảng đã hoàn thành ở checkpoint `4d3c6fbd`

- [x] Inbox thống nhất Web / Facebook / Zalo tại `/admin/chat`.
- [x] Màn hình cấu hình `/admin/settings/integrations`.
- [x] Secret lưu server-side tại `private_config/chat_integrations`.
- [x] Webhook Facebook/Zalo và API gửi trả lời ngoài hệ thống.
- [x] RTDB schema/rules nhận biết nguồn kênh và admin role sync.
- [x] Facebook production webhook đã nhận và lưu tin sau khi sửa IAM/runtime RTDB access.

## Nâng cấp hiện tại

- [x] Thêm modal hồ sơ khách hàng khi bấm avatar.
- [x] Lưu/liên kết `customers/{phone}` từ phòng chat.
- [x] Ưu tiên tên CRM khi phòng đã liên kết khách.
- [x] Fetch và lưu tên/avatar Facebook từ Graph API.
- [x] Thêm endpoint refresh profile cho phòng Facebook cũ.
- [x] Parse/lưu/render sticker, ảnh, audio, video, file Facebook.
- [x] Mở rộng CSP cho media/avatar Facebook CDN.
- [x] Mở rộng RTDB rule cho profile/CRM/attachments.
- [x] Nút tạo sửa chữa và tạo bán lẻ từ modal chat.
- [x] Prefill tên/SDT cho `/admin/repairs` và `/admin/pos`.
- [x] Đồng bộ CRM khi tạo phiếu sửa chữa mới.
- [x] Chặn lỗi tên CRM vượt giới hạn RTDB: tên khách tối đa 100 ký tự, `displayName` rút gọn tối đa 50 ký tự.
- [x] Chuyển handoff CRM sang `sessionStorage` dùng một lần, không còn PII trong URL.
- [x] Khóa RTDB public `guest_`; web chat lấy identity bằng Firebase Anonymous Auth.
- [x] Bắt buộc `chat_support` tại API gửi tin và refresh profile Facebook.
- [x] Giới hạn quyền Firestore `customers/{phone}` theo nghiệp vụ.
- [x] Chuyển Facebook token sang header và dừng lưu raw webhook event mới.
- [x] Ghi báo cáo scan tập trung và hiển thị danh mục artifact trong roadmap_v2.
- [x] Thêm `useCustomerActivity` để tải realtime lịch sử theo một SDT, gồm order legacy fallback.
- [x] Thêm drawer lịch sử tại `/admin/customers` với tab Đơn hàng/Sửa chữa theo quyền.
- [x] Thêm panel tác vụ đang mở tại `/admin/chat`, responsive desktop/mobile và không query module thiếu quyền.
- [x] Thêm deep-link modal `/admin/orders?orderId=` và `/admin/repairs?ticketId=`.
- [x] Nhận diện terminal repair legacy và đánh dấu mặc định `done` là terminal.
- [x] Ẩn hành động tạo POS/Repair trong modal chat nếu user thiếu quyền module tương ứng.
- [x] Lọc chỉ số tổng hợp API hồ sơ chat theo `manage_orders`/`manage_repairs`, không lộ qua `chat_support` đơn thuần.
- [x] Sửa deep-link order cũ ngoài trang đầu vẫn cập nhật trạng thái từ modal được.
- [x] Cache anh Facebook moi vao Storage private va tai qua API co `chat_support`, ghi RTDB truoc de khong chan text.
- [x] Lazy-cache anh cu khi URL Meta van con tai duoc; anh da het han dung Meta Inbox fallback.
- [x] Them nut mo Meta Business Suite Inbox cho room Facebook lam fallback van hanh, khong dung lam link profile.
- [x] Them cau hinh tra loi mau va `/shortcut` tai trang tich hop/chat.
- [x] Giu dinh dang xuong dong cua cau tra loi dai khi gui kenh ngoai.
- [x] Dong bo API cau hinh tich hop theo quyen `manage_settings` cua route, khong gioi han sai chi cho admin.

## Verification cục bộ

- [x] `npm.cmd run typecheck`.
- [x] `npm.cmd run build`.
- [x] Parse JSON config/rules và kiểm tra whitespace diff.

## Chờ deploy/xác minh thực tế

- [x] Bật Firebase Authentication provider `Anonymous` trên production.
- [x] Deploy SSR function/Hosting, Firestore Rules, Realtime Database Rules va Storage Rules cung phien ban.
- [x] Web chat: tạo room an danh mới và nhận/gửi tin sau khi rules đã khóa.
- [x] Facebook: nhận text từ tài khoản mới và hiển thị đúng tên/avatar.
- [x] Facebook: nhận sticker/ảnh; anh moi render qua media API private va van xem duoc sau reload.
- [x] Facebook: admin reply gửi trở lại Messenger.
- [x] CRM: lưu khách từ avatar và kiểm tra `customers/{phone}`.
- [x] Repair/POS: mở form đã prefill, URL không chứa tên/SDT và hoàn tất giao dịch thử.
- [x] Zalo: kiểm thử nhận/gửi sau khi OA API được phê duyệt/có access token.
- [x] CRM history: khách có cả order/repair mở drawer, click từng dòng và xác minh modal đúng.
- [x] RBAC: staff chỉ `manage_orders` không đọc repair; staff chỉ `chat_support` không phát sinh `PERMISSION_DENIED` tại panel.
- [x] Chat work queue: trạng thái hoàn thành/hủy/terminal không xuất hiện; trạng thái đang xử lý cập nhật realtime.

## Sửa lỗi phát sinh 26.05.2026

- [x] Xác định `PERMISSION_DENIED` khi lưu khách mới đến từ modal ghi trực tiếp Firestore và RTDB với hai boundary quyền khác nhau.
- [x] Thêm API `GET/POST /api/admin/chat/rooms/{roomId}/customer` có kiểm tra `chat_support`.
- [x] Chuyển modal profile sang đọc/lưu qua API, không còn ghi Firebase client cho CRM linkage.
- [x] Tách trạng thái CRM đã lưu khỏi trạng thái room link RTDB; timeout/link failure không làm mất thao tác tạo khách.
- [x] Kiểm thử trên `/admin/chat`: lưu khách mới, tải lại room, và thử lại khi RTDB role sync hoạt động.

## Mở rộng lịch sử và tác vụ đang mở 26.05.2026

- [x] Chốt quyền: giữ route/RBAC hiện tại, không cấp thêm quyền order/repair cho `chat_support`.
- [x] Chốt định nghĩa mở: order `Pending|Confirmed|Shipping`; repair/warranty chưa terminal theo workflow.
- [x] Chỉ query dữ liệu theo khách/phòng đang mở, dùng listener realtime trong panel chat.
- [x] Tương thích order cũ dùng `customer.phone` và repair config cũ thiếu terminal flag.
- [x] Cập nhật tài liệu/roadmap hiện có, không tạo tài liệu rời.

## Guardrails bắt buộc

- [x] Không coi webhook verified là đã ghi RTDB thành công.
- [x] Không mở RTDB public để né lỗi role sync/IAM.
- [x] Không tạo URL profile Facebook từ PSID.
- [x] Không mất attachment payload thành placeholder.
- [x] Không tạo đơn hoặc cập nhật kho trực tiếp trong chat.
- [x] Không dùng `startsWith` trong Firebase RTDB Rules; dùng `beginsWith`.
- [x] Không ghi đè SPA shell `roadmap_v2` khi cập nhật dữ liệu lịch sử.
- [x] Không lưu PII chat vào URL/localStorage hoặc raw webhook event dư thừa.
- [x] Không gọi provider API với access token trong query URL.
- [x] Không query/hiển thị lịch sử order hoặc repair từ chat nếu user thiếu quyền module tương ứng.
- [x] Khong cong khai anh khach gui trong Storage; chi tai private media qua API co `chat_support`.
- [x] Danh rieng namespace Storage `private/` cho Admin SDK; anh `private/chat/` chi doc qua media API co quyen.
- [x] Nut Meta Inbox chi la fallback hoi thoai Page, khong duoc gan nhan la trang ca nhan.
