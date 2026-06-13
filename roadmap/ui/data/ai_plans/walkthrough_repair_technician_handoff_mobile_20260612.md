# Tổng kết: Workflow Phân công KTV và Chuyển giao Mobile-first

Luồng làm việc giữa nhân viên quản lý Sale và Kỹ thuật viên đã được triển khai local. Các kiểm tra tĩnh và production build đã pass; browser QA theo đủ ba vai trò vẫn đang chờ phiên đăng nhập phù hợp.

## Các thay đổi và tính năng chính

### 1. Nền tảng Dữ liệu & Transaction (Server-side)
- Bổ sung trường `version` vào bảng `repairs` để khóa chặn các cập nhật đồng thời gây lỗi (Optimistic Concurrency Control).
- Xây dựng hệ thống **PendingTechnicianTransfer** lưu trữ yêu cầu chuyển giao, giúp quá trình chuyển KTV từ "Chuyển ngang" sang "Đề nghị & Xác nhận".
- Xây dựng 2 API cốt lõi chạy trên Server thông qua Firebase Admin SDK sử dụng Transaction:
  - `/api/repairs/technician/assign`: Dùng cho Quản lý/Sale để gán KTV lần đầu (hoặc ép gán khi chưa có ai).
  - `/api/repairs/technician/transfer`: Hỗ trợ luồng Đề nghị chuyển, Chấp nhận/Từ chối chuyển giao và Hủy đề nghị.
- Tích hợp **Idempotency Key** gắn actor, loại thao tác và ticket để chống bấm đúp hoặc tái sử dụng mã cho thao tác khác.
- Bổ sung Audit Log chi tiết lưu vào mảng `statusTimeline` khi thực hiện chuyển giao, đổi trạng thái hay ép buộc đổi trạng thái (Manager Override).

### 2. Trang Quản lý Sửa chữa (`Admin/Sale`)
- Ngăn chặn hoàn toàn việc chuyển trạng thái sửa chữa ra khỏi bước nếu phiếu chưa được gán KTV mà quy trình (Workflow) yêu cầu `requireAssignedTechnician` ở trạng thái hiện tại hoặc trạng thái tiếp theo. Giao diện tự động bật popup yêu cầu gán KTV.
- Fix lỗi Payload khi gán KTV thiếu trường thông tin bắt buộc giúp API nhận dạng chính xác KTV.
- Thêm **AssignTechnicianModal** (Mobile Sheet), yêu cầu nhập lý do khi đề nghị chuyển và không cho client sửa trực tiếp assignment trong form chỉnh sửa.
- Bổ sung **ManagerOverrideModal** (Mobile Sheet) cho Quản lý/Sale khi họ muốn ép chuyển trạng thái phiếu mà bỏ qua các Guardrail của quy trình, đi kèm bắt buộc nhập lý do vào Audit Log.
- Cải thiện trực quan Thẻ phiếu (Card): Hiển thị Tên KTV đang phụ trách rõ ràng. Nếu phiếu đang chờ KTV mới xác nhận, có thêm badge nhấp nháy cảnh báo "Đang chờ KTV chuyển giao".

### 3. Trang Kỹ thuật viên (`Technician`)
- **Hiển thị thông minh**: KTV chỉ nhìn thấy các phiếu **đã được gán cho họ** hoặc các phiếu **đang đề nghị chuyển cho họ** (chờ xác nhận). Không còn thấy phiếu của KTV khác (trừ quyền Admin).
- **Trực quan Đề nghị chuyển giao**: KTV hiện tại có nút **Chuyển KTV**, nhập người nhận và lý do; KTV nhận có nút **Nhận phiếu** và **Từ chối**; người tạo/quản lý có thể hủy yêu cầu pending.
- **Khóa UI thời gian thực (Realtime Lock)**:
  - Nếu KTV đang mở phiếu, nhưng có sự vụ khiến phiếu chuyển qua tay người khác, UI tự động phát hiện `isKtvLocked` và chặn bấm nút, chặn xóa linh kiện, chặn sửa checklist.
  - Khi mở phiếu đang đề nghị chuyển tới, KTV sẽ thấy Banner cảnh báo yêu cầu bấm "Nhận phiếu" trước khi có thể chỉnh sửa bệnh và linh kiện.
- Giao diện thao tác mobile thân thiện với touch target lớn, hạn chế popup lồng nhau, tự động đóng sau khi hoàn tất thao tác.

Thẻ mobile hiển thị trực tiếp blocker theo `allowedFeatures`: checklist, ghi chú kỹ thuật, linh kiện cần chọn hoặc linh kiện chưa sẵn sàng. Các nút thao tác chính dùng chiều cao tối thiểu 44px và checklist chuyển sang hai cột trên màn hình nhỏ.

### 4. Sửa lỗi tính toán Timeline
- Đã sửa lỗi `durationInMinutes` bị tính toán sai thành `NaN` trong Firebase (do trường lưu lại là `at` chứ không phải `timestamp`), đảm bảo hệ thống tính toán chính xác tổng thời gian sửa chữa theo từng trạng thái.

### 5. Xác minh local
- ESLint focused: pass.
- Next typegen + TypeScript: pass.
- Next.js production build: pass.
- Firestore rules dry-run: pass.
- Unit test policy quyền `repairAccess`: 3/3 pass.
- Browser QA: chưa hoàn tất do profile QA bị chuyển về trang đăng nhập; không đánh dấu hoàn thành cho đến khi kiểm tra bằng tài khoản thực tế.

### 6. Chuẩn hóa workflow Firestore v2
- Runtime chỉ đọc `repairStatuses` cho phiếu sửa chữa và `warrantyStatuses` cho phiếu bảo hành. Trường `statuses` legacy không còn tham gia quyết định nghiệp vụ nhưng vẫn được giữ nguyên trong Firestore.
- Các feature dạng `require*` được hiểu là điều kiện phải hoàn tất trước khi rời trạng thái hiện tại. Riêng yêu cầu gán KTV vẫn có guard cứng khi rời entry node.
- Migration bổ sung gate bắt buộc cho tiếp nhận, kiểm tra kỹ thuật, chờ linh kiện, đang sửa và bàn giao; không đổi ID, nhãn, màu, thứ tự hoặc `allowedNext` hiện hữu.
- Firestore migration đã chạy thành công và dry-run sau migration trả về không còn node thay đổi. Backup được tạo trong `scratch` trước khi ghi.
- Production build, TypeScript, ESLint và 6 unit test liên quan đều đạt; ESLint còn warning cũ ngoài phạm vi.
