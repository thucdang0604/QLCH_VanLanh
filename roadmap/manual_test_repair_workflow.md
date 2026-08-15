# Hướng dẫn test thủ công: Workflow sửa chữa và Kỹ thuật viên

## 1. Chuẩn bị

1. Chờ Firestore index `repairs(status ASC, createdAt DESC)` có trạng thái **Enabled**.
2. Đăng nhập hai tài khoản:
   - **Admin**: có quyền `manage_repairs` và `manage_settings`.
   - **KTV**: có quyền `manage_repairs`, không có quyền quản lý.
3. Chuẩn bị một linh kiện có tồn kho và một phiếu sửa chữa mới. Để test phân trang, cần hơn 20 phiếu còn mở cho cùng KTV hoặc tài khoản quản lý.
4. Mở hai cửa sổ trình duyệt riêng: một cho Admin, một cho KTV.

## 2. Test cấu hình workflow động

Vào `Admin > Cài đặt > Sửa chữa`.

| Bước | Thao tác | Kết quả mong đợi |
|---|---|---|
| 2.1 | Mở một node không phải node cuối | Hiện 4 nhóm: chức năng sử dụng, điều kiện chuyển flow, tự động khi đi vào node, hậu xử lý/báo cáo; không hiện “Cách kết thúc phiếu”. |
| 2.2 | Mở node cuối | Có thêm “Cách kết thúc phiếu” và “Luồng tiếp theo” phải trống. |
| 2.3 | Chọn `Bàn giao khách` | Hệ thống tự gắn ngầm yêu cầu bàn giao; không có checkbox lặp lại ở các nhóm khác. |
| 2.4 | Chọn `Hoàn phí` | Hệ thống tự gắn ngầm yêu cầu bàn giao và kết quả hoàn phí. |
| 2.5 | Chọn `Hoàn tất nội bộ` | Bỏ hai cờ bàn giao/hoàn phí ngầm; node vẫn là node cuối. |
| 2.6 | Lưu, tải lại trang | Không còn lỗi `setDoc ... undefined`; cấu hình và luồng tiếp theo giữ nguyên. |
| 2.7 | Tạo một trạng thái có `allowedNext` trỏ tới ID không tồn tại hoặc tự trỏ chính nó | Không được lưu; giao diện hiển thị lỗi validation. |

## 3. Test quyền và danh sách KTV

| Bước | Thao tác | Kết quả mong đợi |
|---|---|---|
| 3.1 | Đăng nhập bằng KTV A, mở `Admin > Kỹ thuật viên` | Chỉ thấy phiếu được gán cho KTV A và phiếu đang chờ KTV A nhận chuyển giao. |
| 3.2 | Đăng nhập bằng KTV B | Không thấy phiếu riêng của KTV A. |
| 3.3 | Admin đề nghị chuyển một phiếu A sang B | B nhìn thấy phiếu ở dạng chờ nhận, chưa được phép sửa checklist/trạng thái. |
| 3.4 | B chọn `Nhận phiếu` | Phiếu chuyển sang B; A không còn được thao tác như KTV phụ trách. |
| 3.5 | Tạo hơn 20 phiếu mở | Ban đầu tối đa 20 phiếu mới nhất mỗi luồng được realtime; nút `Tải thêm phiếu cũ` xuất hiện. |
| 3.6 | Bấm `Tải thêm phiếu cũ` một lần | Có thêm tối đa 20 phiếu mỗi luồng còn dữ liệu; không mất danh sách phiếu mới. |

## 4. Test điều kiện chuyển workflow

Thực hiện trên một phiếu đang ở node đã bật từng điều kiện tương ứng.

| Cờ cấu hình | Thao tác kiểm tra | Kết quả mong đợi |
|---|---|---|
| `Yêu cầu checklist` | Để trống ít nhất một mục checklist rồi chuyển | Bị chặn, thông báo yêu cầu hoàn tất 8 mục. |
| `Yêu cầu phân công KTV` | Không gán KTV rồi chuyển sang node yêu cầu | Bị chặn; Admin được hướng dẫn gán KTV. |
| `Yêu cầu ghi chú kỹ thuật` | Không có ghi chú kỹ thuật rồi chuyển | Bị chặn/mở hộp nhập ghi chú. Lưu ghi chú rồi chuyển thành công. |
| `Yêu cầu linh kiện sẵn sàng` | Có linh kiện trạng thái yêu cầu/đặt hàng | Không thể chuyển sang bước tiếp theo. Sau khi linh kiện sẵn sàng thì chuyển được. |
| `Cổng thanh toán` | Đưa phiếu vào node chờ thanh toán | KTV không thấy phiếu thao tác; Admin được dẫn sang POS để thu tiền. |

## 5. Test linh kiện và tồn kho

| Bước | Thao tác | Kết quả mong đợi |
|---|---|---|
| 5.1 | Ở node bật chọn linh kiện, thêm linh kiện có sẵn | KTV/Admin thấy UI linh kiện và có thể chọn. |
| 5.2 | Chuyển vào node bật `Giữ tạm linh kiện` | Trường `held` của sản phẩm tăng, tồn kho thực tế chưa giảm. |
| 5.3 | Chuyển vào node bật `Xuất/xác nhận linh kiện` | Có bước xác nhận dùng/hoàn; dùng thì tồn kho giảm, giữ tạm giảm. |
| 5.4 | Kết thúc ở node bật `Hoàn giữ linh kiện` | Các linh kiện chưa xuất dùng được giải phóng; không được âm `held`. |

## 6. Test ba cách kết thúc phiếu

| Cách kết thúc | Thao tác | Kết quả mong đợi |
|---|---|---|
| `Hoàn tất nội bộ` | Chuyển trực tiếp từ node trước đó vào node này | Phiếu bị khóa; không mở modal bàn giao. |
| `Bàn giao khách` | Chọn node này từ Admin | Mở modal bàn giao/đối soát. KTV không thể bỏ qua modal bằng nút chuyển trạng thái. |
| `Hoàn phí` | Chọn node này từ Admin | Mở modal bàn giao ở ngữ cảnh hoàn phí. Không thể gọi chuyển trực tiếp để đóng phiếu. |

Sau mỗi trường hợp, kiểm tra dòng timeline ghi đúng trạng thái đích, người thực hiện và thời điểm.

## 7. Test POS, báo cáo và hoa hồng

1. Tạo một phiếu có KTV A và người tạo phiếu là nhân viên S.
2. Tại node kết thúc, lần lượt bật/tắt hai checkbox hoa hồng rồi thu tiền qua POS hoặc hoàn tất qua bàn giao.

| Cờ bật | Dữ liệu cần kiểm tra |
|---|---|
| Chỉ `Hoa hồng KTV` | Collection/trang Hoa hồng chỉ có bản ghi cho KTV A. |
| Chỉ `Hoa hồng người chốt đơn` | Chỉ có bản ghi cho nhân viên S. |
| Bật cả hai, A khác S | Có hai bản ghi, mỗi người một bản ghi. |
| Bật cả hai, A cũng là S | Chỉ có một bản ghi hoa hồng, không bị trả trùng. |
| `Ghi nhận hoàn thành vào báo cáo` | Số phiếu hoàn thành/bảo hành trên báo cáo tăng theo node đã bật cờ. |

## 8. Kiểm tra lỗi và dữ liệu cuối

1. Mở Console khi vào trang KTV: không được có `FirebaseError: The query requires an index` sau khi index đã Enabled.
2. Không được còn lỗi `setDoc() ... Unsupported field value: undefined` khi lưu Cài đặt.
3. Refresh cả hai cửa sổ trình duyệt: quyền, trạng thái, KTV phụ trách, linh kiện và timeline phải giữ đúng.
4. Kiểm tra Firestore cho một phiếu mẫu: `status`, `statusTimeline`, `version`, `staff`, `parts` và `payment` phải nhất quán với thao tác đã thực hiện.

## 9. Dữ liệu cần ghi nhận khi test lỗi

Nếu có lỗi, lưu lại: URL trang, mã phiếu, tài khoản đang dùng, trạng thái hiện tại/đích, thời gian, ảnh màn hình và Console error. Không sửa trực tiếp dữ liệu Firestore để bỏ qua điều kiện workflow.
