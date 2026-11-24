# Web Tool

Bộ công cụ chạy trên web phục vụ việc phát triển phần mềm, dùng trên chính máy của mình. Tool đầu tiên là **Terminal**: mở shell của máy ngay trong trình duyệt, tối ưu cho việc chạy AI agent trên nhiều repo.

Việc còn lại và các điểm cần quyết định nằm ở [CHECKLIST.md](CHECKLIST.md).

## Chạy

```bash
npm install
npm run dev      # mở http://localhost:5173
```

| Lệnh | Tác dụng |
|---|---|
| `npm run dev` | Chạy server (cổng 3001) và giao diện (cổng 5173) cùng lúc, tự nạp lại khi sửa code |
| `npm run build` | Kiểm tra kiểu và build giao diện vào `dist/` |
| `npm start` | Chạy bản production trên một cổng duy nhất, 3001 (cần `npm run build` trước) |
| `npm run typecheck` | Chỉ kiểm tra kiểu |

Lưu ý khi dev:

- Mở đúng `http://localhost:5173`. Cổng 3001 chỉ là API nên sẽ hiện "Cannot GET /"; `127.0.0.1:5173` không kết nối được vì Vite chỉ nghe trên `localhost`.
- Nếu cổng 5173 đang bận, Vite tự nhảy sang 5174, xem dòng `Local:` trong terminal.
- Sửa file trong `server/` làm server khởi động lại, mọi phiên terminal đang mở sẽ bị ngắt.

Biến môi trường (đều không bắt buộc):

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | `3001` | Cổng của server |
| `HOST` | `127.0.0.1` | Địa chỉ server nghe |
| `WEB_TOOL_CWD` | thư mục home | Thư mục mở đầu của terminal không gắn với repo nào |
| `WEB_TOOL_BUSY_MS` | `3000` | Terminal in ra liên tục bao lâu thì coi là "đang chạy" |
| `WEB_TOOL_QUIET_MS` | `5000` | Im lặng bao lâu sau khi chạy thì coi là "xong" |

## Tính năng của tool Terminal

**Terminal**
- Shell đăng nhập của máy (`$SHELL`, mặc định zsh), nhiều tab, tự co giãn theo cửa sổ.
- Chấm trạng thái trên mỗi tab: vàng = đang kết nối, xanh lá = sẵn sàng, đỏ = đã ngắt.

**Theme màu**
- 9 theme: Midnight (mặc định), Tokyo Night, Dracula, Catppuccin Mocha, One Dark, Nord, Gruvbox Dark, Solarized Light, GitHub Light.
- Đổi bằng nút ở góc phải thanh tab; áp dụng ngay cho mọi tab và được ghi nhớ trong trình duyệt.

**Repo đã lưu** (bảng bên trái terminal)
- Lưu repo theo ba cách: `cd` tới rồi bấm "Lưu thư mục hiện tại", dán đường dẫn (nhận cả `~/...`), hoặc bấm nút thư mục để duyệt và chọn.
- Bấm vào repo: chuyển về tab đang mở của repo đó, chưa có thì mở tab mới ngay tại thư mục repo.
- Rê chuột vào repo: `+` mở thêm tab mới cho cùng repo, `×` bỏ khỏi danh sách (không xoá thư mục).
- Hộp duyệt thư mục gắn nhãn `git` cho repo, ẩn thư mục bắt đầu bằng dấu chấm, và mở lại ở nơi duyệt lần trước.
- Có ô tìm kiếm khi danh sách hơn 5 repo; repo có thư mục không còn tồn tại bị gạch ngang.
- Nút đầu thanh tab ẩn/hiện bảng repo; màn hình hẹp dưới 640px thì bảng mặc định đóng và nổi đè lên terminal khi mở.

**Thông báo khi chạy xong**
- Tab có việc đang chạy hiện chấm xanh dương nhấp nháy.
- Khi việc dừng hoặc chương trình kêu chuông, tab chuyển chấm cam và chữ đậm, repo tương ứng có chấm cam, tiêu đề trang hiện số tab đang chờ, ví dụ `(1) Web Tool`.
- Chỉ báo khi không đang nhìn tab đó; bấm vào tab là hết dấu báo.
- Nút "Thông báo" trên thanh tab (mặc định tắt) bật thêm thông báo của trình duyệt; bấm vào thông báo sẽ về đúng tab.

## Cấu trúc

Giao diện: React + Vite + TypeScript, hiển thị terminal bằng xterm.js. Server: Express + `ws` + `node-pty`, chạy trực tiếp TypeScript bằng `tsx`.

```
server/
  index.ts        Khởi động Express, gắn API và WebSocket, phục vụ dist/ khi production
  terminal.ts     WebSocket /ws/terminal: mỗi kết nối là một shell (pty)
  activity.ts     Đoán "đang chạy / xong" theo dòng output của shell
  repos.ts        API /api/repos: danh sách repo đã lưu
  fs.ts           API /api/fs/dirs: liệt kê thư mục cho hộp chọn
  security.ts     Kiểm tra nguồn gốc yêu cầu
src/
  App.tsx         Khung chung: sidebar danh sách tool, giữ tool đã mở không bị mất trạng thái
  tools/index.ts  Nơi đăng ký các tool
  tools/terminal/
    TerminalTool.tsx   Quản lý tab, repo, theme, thông báo
    TerminalView.tsx   Một terminal xterm.js nối với một WebSocket
    RepoPanel.tsx      Bảng repo đã lưu
    FolderPicker.tsx   Hộp duyệt và chọn thư mục
    ThemePicker.tsx    Nút chọn theme
    themes.ts          Bảng màu các theme
    repos.ts           Gọi API repo và API thư mục
    notifications.ts   Thông báo của trình duyệt
public/
  favicon.svg     Biểu tượng trang
data/repos.json   Danh sách repo đã lưu (tự tạo, không đưa vào git)
```

**Thêm tool mới:** tạo thư mục `src/tools/<tên-tool>/` với một component nhận prop `active`, rồi khai báo vào mảng `tools` trong `src/tools/index.ts`. API phía server gắn dưới `/api/...` trong `server/index.ts` để được kiểm tra nguồn gốc sẵn.

**Giao thức terminal** (JSON qua WebSocket, tham số `cols`, `rows`, `cwd` trên URL):

| Chiều | Tin nhắn |
|---|---|
| Trình duyệt → server | `input` (phím gõ), `resize` |
| Server → trình duyệt | `ready` (id phiên), `output`, `activity` (`busy` / `done`), `exit`, `error` |

## Bảo mật

Tool này cho toàn quyền shell trên máy, nên chỉ dành cho dùng cục bộ:

- Server chỉ nghe trên `127.0.0.1`.
- WebSocket và các API ghi dữ liệu chỉ nhận yêu cầu có `Host` và `Origin` là `localhost` / `127.0.0.1`. Website bên ngoài và kiểu tấn công DNS rebinding bị từ chối với mã 403.
- Mọi trang chạy trên `localhost` của máy này đều được tin, kể cả ứng dụng dev khác.
- Chưa có đăng nhập. **Không đổi `HOST` để mở ra mạng** khi chưa làm phần đăng nhập.

## Giới hạn hiện tại

- Tải lại trang hoặc đóng tab trình duyệt là shell bị tắt, việc đang chạy dở mất theo.
- "Chạy xong" được đoán theo dòng output: lệnh có quãng im lặng hơn 5 giây giữa chừng bị báo sớm, và chưa phân biệt "xong hẳn" với "agent đang hỏi".
- Thông báo của trình duyệt đã viết nhưng chưa được thử thực tế.
- Trong 9 theme mới xem thử Midnight và Solarized Light.
- Đọc thư mục hiện tại của shell dùng `lsof` (macOS) hoặc `/proc` (Linux); chưa hỗ trợ Windows.
- Chưa có test tự động; các tính năng được thử tay trong trình duyệt.

## Ghi chú cài đặt

Bản dựng sẵn của `node-pty` trên macOS thiếu quyền chạy cho file `spawn-helper`, gây lỗi `posix_spawnp failed`. Bước `postinstall` trong `package.json` tự sửa quyền này sau mỗi lần `npm install`.
