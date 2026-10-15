# FocusFlow

Ứng dụng HTML/CSS/JavaScript thuần, chạy trực tiếp trên GitHub Pages, không cần cài dependency hoặc build bundle.

## Chức năng

- Focus, Short Break, Long Break; Start, Pause, Resume, Stop và Skip.
- Settings mặc định: Focus 60 phút, Short Break 15 phút, Long Break 30 phút, nghỉ dài sau 2 Focus session. Chỉ nhận số nguyên dương. Thay đổi áp dụng từ block tiếp theo nếu timer đang chạy hoặc tạm dừng.
- Tạo, chọn, hoàn thành task. Session giữ task được chọn lúc bắt đầu, kể cả khi sau đó đổi hoặc hoàn thành task.
- Lưu session và điểm Focus 1–5. Stop/Skip Focus lưu phần thời gian thực tế đã tập, không tính thời gian Pause. Block kế tiếp chờ bấm Start.
- Statistics: tổng Focus time hôm nay, số session hôm nay và tổng 7 ngày theo ngày kết thúc trên thiết bị.
- Lưu local, đồng bộ Google Sheets khi được cấu hình, hỗ trợ PWA và offline.

## Chạy local

```sh
python -m http.server 8000
```

Mở <http://localhost:8000>. Dùng localhost hoặc HTTPS để bật service worker. Không cần npm. Source chính: `index.html`, `app.js`, `styles.css`; PWA: `service-worker.js`, `manifest.json`, các file icon.

## Google Sheets

1. Tạo spreadsheet, mở **Extensions → Apps Script**.
2. Dán nội dung `Code.gs`. Điền `SPREADSHEET_ID` bằng đoạn ID giữa `/d/` và `/edit` trong URL spreadsheet, rồi lưu.
3. **Deploy → New deployment → Web app**. Chọn **Execute as: Me**, **Who has access: Anyone**, cấp quyền và sao chép URL `/exec`.
4. Điền URL vào `googleAppsScriptUrl` trong `config.js`, publish app, rồi tải lại.
5. Mở `/exec?action=all` bằng cửa sổ ẩn danh để kiểm tra phản hồi JSON. Script tự tạo hai tab và hàng tiêu đề:

```text
Tasks:    id | title | status | created_at | completed_at | type | parent_id
Sessions: id | task_id | planned_duration | actual_duration | started_at | ended_at | focus_score
```

Duration lưu bằng giây; timestamp lưu dạng ISO. Giữ nguyên thứ tự các cột. Khi cập nhật script, dùng **Deploy → Manage deployments → Edit → New version → Deploy** để giữ URL hiện tại. Đừng thay Spreadsheet ID đã cấu hình bằng placeholder trong source.

Tên task được ghi dưới dạng văn bản để Sheets không tự đổi `15-10` thành ngày. Với ô cũ đã bị đổi kiểu, API đọc theo chữ đang hiển thị trong cột `title`, không trả timestamp ngày. Nếu tên đã bị ghi thành chuỗi ISO ngay trong Sheet, cần nhập lại tên đúng vào ô đó; script không tự đoán tên gốc.

App đọc Sheets khi mở lại, gửi các bản ghi local chưa được xác nhận và đồng bộ khi task/session thay đổi. Ghi tuần tự, cập nhật theo ID để tránh tạo trùng; bản ghi lỗi được giữ trong localStorage và thử lại khi có mạng, tải lại app hoặc có thay đổi tiếp theo. Settings và trạng thái timer chỉ lưu trên thiết bị. Không có đồng bộ trực tiếp giữa các thiết bị đang mở app.

URL endpoint trong app công khai có thể được người khác sử dụng để đọc/ghi dữ liệu qua script. Sheet không nên chứa dữ liệu nhạy cảm.

## PWA và dữ liệu cũ

Manifest có icon PNG 192/512 và SVG. Trên điện thoại dùng Add to Home Screen. Service worker ưu tiên file mới từ mạng, dùng cache khi offline; chỉ cache tài nguyên app, không cache API Sheets. Khi có cập nhật, đóng/mở lại hoặc tải lại app.

Bản viết lại giữ storage key `tempo-data-v1` để bảo toàn task, session, settings và timer cũ. Timer đang chạy được khôi phục bằng timestamp. Nếu mở lại sau khi hết giờ, chỉ ghi một session với thời lượng tối đa bằng thời lượng dự kiến. Âm thanh/thông báo tùy khả năng trình duyệt; khi app bị hệ điều hành đóng, thông báo không được đảm bảo.

## Kiểm tra thay đổi

```sh
node --check app.js
node --check service-worker.js
```

PowerShell: `Get-Content -Raw Code.gs | node --check`. Kiểm tra diff bằng `git diff --check`.

Các luồng cần kiểm tra: task, Pause/Resume, Skip/Stop, Short/Long Break, settings qua reload, chấm điểm qua reload, thống kê, mất mạng và gửi lại. Kiểm tra timer hết giờ khi tab bị ẩn và giao diện ở chiều rộng 360px. Khi kiểm tra đồng bộ, dùng Sheet thử riêng hoặc mô phỏng API để không tạo bản ghi thử trong Sheet thật.

Khi c?p nh?t b?n h? tr? Undo/x?a task, ph?i deploy `Code.gs` m?i ?? endpoint nh?n action `reopenTask` v? status `deleted`. C?c thao t?c ch?a ???c server x?c nh?n v?n ???c gi? trong h?ng ??i local qua reload.

## Group v? th?i gian task

Trong Tasks, ch?n `Group` b?n c?nh ? t?o m?i ?? t?o cha. Nh?p task con trong ? `Add a task to this group`. Ch?m t?n task con ?? ch?n, chuy?n sang Focus r?i Start nh? v?i task th??ng. C? th? gi? c?c task ??c l?p b?n ngo?i group.

M?i task hi?n th? t?ng th?i gian Focus ?? l?u, ch?nh x?c ??n gi?y. Group c?ng th?i gian c?a c?c con, g?m con ?? Done v? l?ch s? c?a con ?? x?a; kh?ng c?ng Pause ho?c Break. T?ng c?p nh?t sau khi Focus k?t th?c, Stop ho?c Skip. Group l? m?t c?p, kh?ng ch?y timer ri?ng n?n kh?ng c?ng tr?ng th?i gian.

Code.gs m?i t? th?m `type` v? `parent_id` v?o cu?i b?ng Tasks n?m c?t c?. Task c? m?c ??nh `type=task`, `parent_id` tr?ng; group d?ng `type=group`; con d?ng ID cha trong `parent_id`. Sessions gi? nguy?n c?u tr?c v? li?n k?t v?i ID task con.

C?n deploy Code.gs phi?n b?n m?i tr??c khi ??ng b? group. N?u endpoint c?n b?n c?, group v? c?c thao t?c li?n quan v?n ???c gi? local trong h?ng ??i, kh?ng g?i d? li?u thi?u c?u tr?c cha/con. X?a group c? x?c nh?n v? x?a c?c con kh?i danh s?ch, gi? to?n b? l?ch s? Focus.
