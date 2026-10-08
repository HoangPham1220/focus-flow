# Prompt V1 — Focus App

Tạo hoàn chỉnh một web app cá nhân đơn giản tên **Tempo** để hỗ trợ học tập và làm việc theo chu kỳ tập trung → nghỉ.

## Mục tiêu

Tạo một web app **MVP thật đơn giản**, ưu tiên mobile.

App sau này sẽ:
- Deploy lên GitHub Pages.
- Cài vào điện thoại bằng "Add to Home Screen".
- Lưu dữ liệu vào Google Sheets.

Không thêm chức năng ngoài phạm vi bên dưới.

## Công nghệ

- HTML
- CSS
- JavaScript thuần
- PWA
- Google Sheets thông qua Google Apps Script
- Không dùng framework nếu không cần thiết.

## 1. Timer — chức năng chính

Màn hình chính chỉ tập trung vào timer.

Mặc định:

- Focus: 60 phút
- Break: 15 phút

Có thể Start, Pause, Resume và Stop.

Khi Focus kết thúc:
→ chuyển sang Break.

Khi Break kết thúc:
→ chuyển lại Focus.

Hiển thị:

- thời gian còn lại
- Focus / Break
- task đang làm

Có âm thanh hoặc browser notification khi timer kết thúc nếu trình duyệt hỗ trợ.

## 2. Task

Người dùng có thể:

- tạo task
- chọn task
- hoàn thành task

Mỗi task chỉ cần:

- id
- title
- status
- created_at
- completed_at

Không cần category, priority, deadline hoặc các tính năng quản lý task nâng cao.

## 3. Lưu Focus Session

Khi người dùng kết thúc một Focus session, lưu:

- id
- task_id
- planned_duration
- actual_duration
- started_at
- ended_at

Sau khi session kết thúc, hỏi:

**Focus của session này thế nào?**

1 2 3 4 5

Và lưu focus_score.

## 4. Thống kê cơ bản

Một màn hình Statistics hiển thị:

- Focus time hôm nay
- số Focus sessions hôm nay
- Focus time 7 ngày gần nhất

Không cần biểu đồ phức tạp.

## 5. Google Sheets

Google Sheets có 2 sheet chính:

### Tasks

id | title | status | created_at | completed_at

### Sessions

id | task_id | planned_duration | actual_duration | started_at | ended_at | focus_score

Tạo Google Apps Script đơn giản để đọc/ghi hai loại dữ liệu này.

URL Google Apps Script phải nằm trong một file config riêng.

Nếu chưa cấu hình Google Sheets, app phải sử dụng localStorage để tôi vẫn có thể chạy và test app hoàn chỉnh.

## 6. Giao diện

Thiết kế:

- tối giản
- hiện đại
- mobile-first
- dark mode
- timer lớn ở giữa màn hình
- button lớn, dễ bấm trên điện thoại

Chỉ cần 3 màn hình:

1. **Focus** — timer + task hiện tại
2. **Tasks** — danh sách task
3. **Statistics** — thống kê

Navigation đơn giản ở cuối màn hình.

## 7. PWA

Tạo:

- manifest.json
- service-worker.js
- icon placeholder

App phải có thể Add to Home Screen.

## 8. Yêu cầu hoàn thành

Không chỉ tạo skeleton.

Hãy:

1. Tạo toàn bộ source code.
2. Chạy app local.
3. Test các flow chính:
   - tạo task
   - chọn task
   - chạy timer
   - pause/resume
   - kết thúc session
   - lưu focus score
   - xem statistics
4. Sửa các lỗi phát hiện được.
5. Tạo README.md với cách chạy app.

Nếu Google Sheets chưa được cấu hình thì dùng localStorage và ghi rõ cách cấu hình Google Apps Script trong README.

**Không thêm authentication, account, backend server, analytics, category, deadline, priority, social features hoặc bất kỳ chức năng nào khác chưa được yêu cầu.**

Mục tiêu của V1 là:

**Một timer tốt + task đơn giản + lưu lịch sử focus + thống kê cơ bản.**

Hãy tự quyết định các chi tiết implementation nhỏ và hoàn thành project mà không hỏi lại những câu hỏi không cần thiết.
