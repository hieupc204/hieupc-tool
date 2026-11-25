# Checklist tool Terminal

Cách dùng file này: đánh dấu `[x]` vào mục bạn muốn làm, ghi điều chỉnh vào dòng **Ghi chú** của mục đó, rồi báo lại. Thứ tự các mục chưa làm là thứ tự tôi đề xuất.

## Đã làm

- [x] **Terminal trong trình duyệt** — shell đăng nhập của máy, nhiều tab, tự co giãn theo cửa sổ.
- [x] **Theme màu** — 9 theme (7 tối, 2 sáng), ghi nhớ lựa chọn.
- [x] **Lưu repo** — lưu thư mục đang đứng hoặc dán đường dẫn; bấm repo là mở terminal tại đó.
- [x] **Chọn thư mục bằng hộp duyệt** — nút thư mục cạnh ô dán đường dẫn, có nhãn `git` cho repo.
- [x] **Thông báo khi chạy xong** — bản đầu tiên, xem phần "Cần bạn xem lại".

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
- [x] **2. Xem các file thay đổi (diff)** — bản làm thử, chờ bạn xem. Nút trên thanh tab kèm số file đã đổi; bấm mở bảng bên phải liệt kê thay đổi chưa commit của repo mà terminal đang đứng, tự cập nhật khi agent sửa. Đánh dấu "Đã xem" từng file, file bị sửa tiếp thì mất dấu. Chỉ xem, chưa commit hay bỏ thay đổi được; chưa hiện thay đổi agent đã commit.
  - Ghi chú:
- [x] **3. Chia đôi màn hình** — bản làm thử, chờ bạn xem. Nút chia đôi trên thanh tab mở thêm một terminal bên phải, cùng thư mục. Mỗi ô có dải tab riêng ngay phía trên: tab ở bên nào thì luôn hiện ở bên đó, nút `+` của ô nào mở tab ở ô đó. Bỏ chia đôi rồi chia lại thì tab về đúng chỗ cũ. Chưa chuyển được tab sang ô bên kia, chưa kéo được vạch ngăn để đổi tỉ lệ (đang cố định 50/50).
  - Ghi chú:
- [ ] **4. Lệnh nhanh theo repo** — lưu sẵn vài lệnh (`claude`, `npm run dev`, chạy test…) thành nút bấm; tuỳ chọn tự chạy một lệnh khi mở repo.
  - Ghi chú:
- [x] **5. Git worktree cho nhiều agent song song** — bản làm thử, chờ bạn xem. Rê chuột vào repo, bấm `⑂`, gõ tên nhánh: tool tạo worktree ở thư mục `<tên-repo>.worktrees/<nhánh>` cạnh repo rồi mở terminal ở đó. Các worktree hiện thụt vào dưới repo; bấm `×` hai lần để xoá thư mục (giữ lại nhánh).
  - Ghi chú:
- [ ] **6. Tiện ích nhỏ** (chọn từng cái)
  - [x] Dán hoặc kéo thả file vào terminal để chèn đường dẫn — bản làm thử, chờ bạn xem. Kéo từ Finder thì chèn đường dẫn thật của file trên máy; ảnh dán từ clipboard thì lưu vào thư mục tạm.
  - [ ] Tìm kiếm trong nội dung đã in ra
  - [ ] Phím tắt chuyển tab và chuyển repo
  - [ ] Đổi tên tab
  - [ ] Chỉnh cỡ chữ
  - Ghi chú:
- [ ] **7. Truy cập từ điện thoại** — cần làm đăng nhập trước, vì hiện server chỉ cho máy này kết nối.
  - Ghi chú:

## Việc dọn dẹp nhỏ

- [x] Thêm favicon.
- [x] Khởi tạo git và đẩy lên GitHub (`hieupc204/hieupc-tool`).
- [x] Nút ẩn/hiện bảng repo ở đầu thanh tab; màn hình hẹp dưới 640px thì bảng nổi đè lên terminal.
- [x] Đưa `.gitignore` lên GitHub.

## Ý của bạn

Ghi thêm tính năng hoặc điều chỉnh khác ở đây:

-
