# Workflow sửa chữa, phân công KTV và chuyển giao có xác nhận

**Status:** merged-master-awaiting-role-qa (PR #9)

## 1. Mục tiêu

Chuẩn hóa ranh giới nghiệp vụ giữa trang **Sửa chữa** của nhân viên quản lý/Sale và trang **KTV**, đồng thời tối ưu toàn bộ thao tác theo hướng mobile-first.

- Phiếu mới luôn bắt đầu tại trạng thái **Chờ tiếp nhận**.
- Có thể gán KTV ngay khi tạo phiếu hoặc gán sau khi nhân viên tiếp nhận kiểm tra máy lần đầu.
- Không được chuyển khỏi bước tiếp nhận sang bước xử lý tiếp theo nếu phiếu chưa có KTV phụ trách.
- KTV chỉ thao tác nghiệp vụ trên phiếu đang được giao cho mình.
- Nhân viên quản lý/Sale có thể quản lý, chuyển trạng thái và đề nghị chuyển KTV nhưng các thao tác can thiệp phải được xác nhận và ghi log.
- Chuyển KTV là quy trình đề nghị và tiếp nhận; KTV mới phải chấp nhận thì trách nhiệm mới được chuyển.

## 2. Quy tắc tạo phiếu và chuyển trạng thái

1. Server ép trạng thái ban đầu về entry node của workflow sửa chữa trong Firebase, tương ứng **Chờ tiếp nhận**; không tin trạng thái do client tự gửi.
2. Nhân viên tiếp nhận có thể lưu thông tin trao đổi, tình trạng máy và kết quả kiểm tra lần đầu khi chưa gán KTV.
3. Khi người dùng yêu cầu chuyển sang bước tiếp theo:
   - Nếu chưa có KTV, server từ chối transition.
   - UI hiển thị ngay yêu cầu **Cần gán KTV** và mở luồng chọn KTV.
   - Sau khi gán thành công, người dùng có thể tiếp tục thao tác chuyển trạng thái.
4. Mọi transition vẫn phải tuân theo `allowedNext` và guardrail lấy từ `system_config/repairs` trong Firebase.
5. KTV được gán có quyền thực hiện các thao tác kỹ thuật và transition hợp lệ trên trang KTV.
6. Nhân viên quản lý/Sale thao tác transition từ trang Sửa chữa phải xem nội dung cảnh báo, xác nhận và nhập lý do trước khi gửi.

## 3. Quy trình chuyển giao KTV

### 3.1 Tạo yêu cầu

- KTV hiện tại hoặc nhân viên quản lý/Sale có quyền tạo yêu cầu chuyển sang một KTV mới.
- Yêu cầu phải có KTV nhận, người đề nghị, thời gian, nguồn thao tác và lý do.
- Trong thời gian chờ, `assignedTechnician` vẫn là KTV hiện tại; trách nhiệm và quyền thao tác chưa thay đổi.
- Một phiếu chỉ có tối đa một yêu cầu chuyển KTV đang chờ xử lý.

### 3.2 Phản hồi

- Chỉ KTV được đề nghị mới được **Chấp nhận** hoặc **Từ chối**.
- Khi chấp nhận, server dùng transaction để:
  - Kiểm tra yêu cầu vẫn còn hiệu lực và đúng người nhận.
  - Cập nhật KTV phụ trách mới.
  - Đóng yêu cầu chuyển với trạng thái `accepted`.
  - Tăng `version` và ghi audit log.
- Khi từ chối, KTV hiện tại tiếp tục phụ trách và yêu cầu được đóng với trạng thái `rejected`.
- Người tạo yêu cầu hoặc quản lý/Sale có thể hủy khi yêu cầu vẫn đang `pending`.
- Sau khi chấp nhận, KTV cũ mất quyền thao tác và KTV mới nhận quyền ngay.

## 4. Mô hình dữ liệu dự kiến

Giữ các trường tương thích hiện có và bổ sung cấu trúc có kiểu rõ ràng:

- `staff.assignedTechnician`
- `staff.assignedTechnicianName`
- `pendingTechnicianTransfer`
  - `id`
  - `fromTechnicianId`, `fromTechnicianName`
  - `toTechnicianId`, `toTechnicianName`
  - `requestedBy`, `requestedByName`, `requestedByRole`
  - `reason`, `source`
  - `status: pending | accepted | rejected | cancelled | superseded`
  - `requestedAt`, `respondedAt`, `respondedBy`
  - `ticketVersion`
- Audit log append-only cho các sự kiện `technician_assigned`, `transfer_requested`, `transfer_accepted`, `transfer_rejected`, `transfer_cancelled`, `status_transition` và `manager_override`.

Log transition phải có `fromStatus`, `toStatus`, actor ID/tên/vai trò, nguồn trang, lý do, thời gian và request/idempotency ID. Dữ liệu timeline cũ vẫn phải hiển thị được.

## 5. API và kiểm soát đồng thời

Tạo hoặc tách các API server-side:

- Gán KTV lần đầu.
- Tạo yêu cầu chuyển KTV.
- Chấp nhận hoặc từ chối yêu cầu.
- Hủy yêu cầu đang chờ.
- Siết API transition hiện tại bằng kiểm tra assignment và quyền actor.

Tất cả thay đổi assignment, transfer và status dùng Firebase Admin transaction, `version` và idempotency để tránh:

- Hai người đồng thời chuyển trạng thái.
- Chấp nhận yêu cầu đã bị hủy hoặc thay thế.
- Chuyển trạng thái trong lúc KTV vừa được đổi.
- Gửi lặp do mạng mobile yếu hoặc người dùng bấm nhiều lần.

## 6. Phân quyền bắt buộc

- **KTV hiện tại:** thao tác kỹ thuật trên phiếu được giao và tạo yêu cầu chuyển KTV.
- **KTV được đề nghị:** chỉ có quyền phản hồi yêu cầu; chưa được thao tác phiếu trước khi chấp nhận.
- **KTV khác:** không được đọc dữ liệu nhạy cảm hoặc cập nhật phiếu ngoài phạm vi cho phép.
- **Nhân viên quản lý/Sale:** gán KTV, tạo/hủy yêu cầu chuyển và can thiệp transition với xác nhận cùng lý do.
- Quyền sở hữu phải được kiểm tra ở API/rules; lọc danh sách ở client không được xem là rào cản bảo mật.

## 7. UI mobile-first

### 7.1 Thẻ phiếu tại danh sách

Thông tin bắt buộc và điều kiện đang chặn phải hiển thị trực tiếp, không yêu cầu mở chi tiết phiếu:

- Mã phiếu, khách hàng, thiết bị và trạng thái.
- KTV phụ trách hoặc cảnh báo **Chưa gán KTV**.
- Yêu cầu chuyển KTV đang chờ, người nhận và người cần phản hồi.
- Các điều kiện còn thiếu: kiểm tra lần đầu, ghi chú kỹ thuật, checklist, linh kiện hoặc lý do xác nhận.
- Thời gian chờ, mức ưu tiên và hành động tiếp theo.

### 7.2 Trang Sửa chữa

- Nút **Gán KTV** xuất hiện trực tiếp trên thẻ phiếu chưa được phân công.
- Nút **Đề nghị chuyển KTV** hiển thị theo quyền mà không cần mở chi tiết.
- Transition bị chặn phải hiển thị điều kiện thiếu trước khi người dùng bấm.
- Khi quản lý chuyển trạng thái, dùng bottom sheet xác nhận gồm trạng thái cũ/mới, KTV phụ trách và lý do bắt buộc.

### 7.3 Trang KTV

- Yêu cầu chuyển đến KTV được ghim ở đầu danh sách với nút **Chấp nhận** và **Từ chối**.
- KTV hiện tại thấy người đang được đề nghị, thời gian gửi, trạng thái chờ và thao tác hủy nếu có quyền.
- Phiếu đang làm hiển thị trực tiếp checklist, ghi chú còn thiếu và hành động tiếp theo.
- Nếu phiếu được chuyển trong lúc đang mở, UI khóa thao tác ngay, thông báo thay đổi và quay về danh sách.

### 7.4 Chuẩn tương tác mobile

- Bố cục một cột; không dùng bảng cần cuộn ngang cho luồng chính.
- Vùng bấm tối thiểu 44px, không phụ thuộc hover.
- Bộ lọc trạng thái cuộn ngang và giữ vị trí dễ chạm.
- Hành động chính đặt trong vùng thao tác một tay; hành động phụ nằm trong menu.
- Modal quan trọng chuyển thành bottom sheet trên màn hình nhỏ.
- Có trạng thái loading, disabled và chống double-submit rõ ràng.

## 8. Tương thích và migration

- Phiếu cũ chưa có KTV vẫn được xem và chỉnh sửa tại trạng thái tiếp nhận nhưng không được chuyển tiếp trước khi gán.
- Timeline cũ dùng `at` hoặc `timestamp` vẫn render được.
- Không tự động thay đổi KTV hoặc trạng thái của dữ liệu đang tồn tại.
- Workflow Firebase tiếp tục là nguồn quyết định node và `allowedNext`; feature mới phải có fallback an toàn khi cấu hình cũ chưa được cập nhật.

## 9. Kiểm thử hoàn thành

- Tạo phiếu không gán KTV thành công và luôn ở Chờ tiếp nhận.
- Transition sang bước tiếp theo không có KTV bị chặn ở server và hiển thị đúng cảnh báo trên UI.
- Gán KTV rồi transition thành công.
- KTV khác không thể cập nhật phiếu bằng UI hoặc gọi API trực tiếp.
- KTV hiện tại và quản lý/Sale tạo được yêu cầu chuyển.
- KTV mới chưa chấp nhận thì chưa có quyền thao tác.
- Chấp nhận chuyển giao đổi quyền nguyên tử; từ chối/hủy giữ nguyên KTV cũ.
- Quản lý chuyển trạng thái phải có lý do và log đầy đủ.
- Race condition, stale version, duplicate request và mạng chập chờn không tạo trạng thái sai.
- Browser QA trên viewport mobile cho cả trang Sửa chữa và trang KTV.

## 10. Thứ tự triển khai

1. Chuẩn hóa type, policy quyền và audit schema.
2. Xây API gán/chuyển/phản hồi/hủy KTV.
3. Siết API transition và Firestore rules.
4. Cập nhật UI trang Sửa chữa.
5. Cập nhật UI trang KTV.
6. Bổ sung migration compatibility và test tự động.
7. Browser QA mobile, cập nhật walkthrough và đánh dấu task hoàn thành.
