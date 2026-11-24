# Checklist tool Terminal

Cách dùng file này: đánh dấu `[x]` vào mục bạn muốn làm, ghi điều chỉnh vào dòng **Ghi chú** của mục đó, rồi báo lại. Thứ tự các mục chưa làm là thứ tự tôi đề xuất.

## Đã làm

- [x] **Terminal trong trình duyệt** — shell đăng nhập của máy, nhiều tab, tự co giãn theo cửa sổ.
- [x] **Theme màu** — 9 theme (7 tối, 2 sáng), ghi nhớ lựa chọn.
- [x] **Lưu repo** — lưu thư mục đang đứng hoặc dán đường dẫn; bấm repo là mở terminal tại đó.
- [x] **Chọn thư mục bằng hộp duyệt** — nút thư mục cạnh ô dán đường dẫn, có nhãn `git` cho repo.
- [x] **Thông báo khi chạy xong** (mục 2 bên dưới) — bản đầu tiên, xem phần "Cần bạn xem lại".

## Cần bạn xem lại: thông báo khi agent chạy xong

Cách hoạt động hiện tại:

- Tab có việc đang chạy: chấm xanh dương nhấp nháy. Tính là "đang chạy" khi terminal in ra liên tục từ 3 giây trở lên.
- Việc dừng (im lặng 5 giây) hoặc chương trình kêu chuông: tab chuyển chấm cam + chữ đậm, repo tương ứng trong danh sách cũng có chấm cam, tiêu đề trang hiện `(số tab đang chờ)`.
- Chỉ báo khi bạn **không** đang nhìn tab đó. Bấm vào tab là hết dấu báo.
- Nút "Thông báo" trên thanh tab: bật thì có thêm thông báo của trình duyệt (hiện cả khi bạn đang ở ứng dụng khác); bấm vào thông báo là nhảy về đúng tab.

Các điểm bạn có thể muốn chỉnh:

- [ ] **Ngưỡng thời gian** — 3 giây chạy / 5 giây im lặng. Lệnh có quãng nghỉ dài hơn 5 giây giữa chừng sẽ bị báo "xong" sớm.
  - Ghi chú:
- [ ] **Âm thanh** — hiện không có tiếng riêng (chỉ có tiếng của thông báo hệ thống nếu máy bật). Có cần thêm tiếng "ting" không?
  - Ghi chú:
- [ ] **Phân biệt "xong" và "đang hỏi bạn"** — hiện cả hai đều chung một kiểu báo, trừ khi agent tự gửi chuông/thông báo. Muốn tách riêng thì cần nhận diện theo từng agent (Claude Code, Codex…).
  - Ghi chú:
- [ ] **Bật chuông trong Claude Code** — để Claude Code tự kêu chuông đúng lúc cần bạn, đặt kênh thông báo của nó thành chuông terminal. Tôi chưa cấu hình giúp vì đó là cài đặt riêng của bạn.
  - Ghi chú:

## Đề xuất chưa làm

- [ ] **1. Giữ phiên sống khi tải lại trang** — hiện reload hoặc đóng tab trình duyệt là shell tắt, agent chạy dở mất theo. Server giữ shell chạy tiếp và lưu phần đã in ra; mở lại trang thì nối vào phiên cũ.
  - Cần chọn: chỉ sống qua reload trang, hay sống cả khi server khởi động lại (cần cài `tmux`).
  - Ghi chú:
- [ ] **3. Trạng thái git và xem diff** — hiện nhánh và số file đã đổi cạnh mỗi repo; bấm vào xem diff để duyệt thứ agent vừa sửa.
  - Ghi chú:
- [ ] **4. Chia đôi màn hình** — một bên agent, một bên dev server hoặc test.
  - Ghi chú:
- [ ] **5. Lệnh nhanh theo repo** — lưu sẵn vài lệnh (`claude`, `npm run dev`, chạy test…) thành nút bấm; tuỳ chọn tự chạy một lệnh khi mở repo.
  - Ghi chú:
- [ ] **6. Git worktree cho nhiều agent song song** — một nút tạo worktree mới từ repo rồi mở terminal ở đó.
  - Ghi chú:
- [ ] **7. Tiện ích nhỏ** (chọn từng cái)
  - [ ] Dán hoặc kéo thả ảnh vào terminal để chèn đường dẫn file
  - [ ] Tìm kiếm trong nội dung đã in ra
  - [ ] Phím tắt chuyển tab và chuyển repo
  - [ ] Đổi tên tab
  - [ ] Chỉnh cỡ chữ
  - Ghi chú:
- [ ] **8. Truy cập từ điện thoại** — cần làm đăng nhập trước, vì hiện server chỉ cho máy này kết nối.
  - Ghi chú:

## Việc dọn dẹp nhỏ

- [ ] Thêm favicon (hiện trình duyệt báo lỗi 404 cho `favicon.ico`).
- [ ] Khởi tạo git cho dự án (`git init`) — chưa làm vì bạn chưa yêu cầu.
- [ ] Màn hình hẹp dưới 640px: bảng repo đang bị ẩn hẳn, chưa có nút mở lại.

## Ý của bạn

Ghi thêm tính năng hoặc điều chỉnh khác ở đây:

-
