# Hướng dẫn phát triển ứng dụng

## Hai bản triển khai, một giao diện nguồn

Dự án chạy trên Google Apps Script và Netlify, cùng lưu lịch trong Google Sheets. Hãy giữ giao diện của hai nền tảng đồng bộ bằng cách sửa các file giao diện trong `apps-script/`, sau đó chạy `npm run build` để sinh lại các file tương ứng trong `public/`.

`public/` là đầu ra được tạo tự động. Không sửa trực tiếp `public/index.html`, `public/admin.html`, `public/style.css` hoặc `public/app.js`, vì lần build tiếp theo sẽ ghi đè thay đổi. Nếu cần khác biệt riêng cho Netlify, sửa quy tắc trong `scripts/sync-public.mjs` rồi build lại.

| Nguồn trong `apps-script/` | File được tạo trong `public/` |
| --- | --- |
| `Index.html` | `index.html` |
| `Admin.html` | `admin.html` |
| `Styles.html` | `style.css` |
| `Client.html` | `app.js` |

`apps-script/Code.gs` xử lý đọc và ghi Google Sheets, kiểm tra lịch trùng và quyền quản trị. `doGet()` hiển thị giao diện Apps Script. `doPost()` cung cấp cổng JSON để Netlify gọi các thao tác đó.

## Cách kết nối hai nền tảng

- Trong Apps Script, hàm `call()` ở `Client.html` gọi các hàm máy chủ bằng `google.script.run`.
- Khi build Netlify, `scripts/sync-public.mjs` thay lớp gọi đó bằng `fetch('/.netlify/functions/api', ...)` và thay các URL điều hướng Apps Script bằng đường dẫn của trang Netlify.
- `netlify/functions/api.js` kiểm tra phương thức, dữ liệu đầu vào và danh sách thao tác được phép, rồi chuyển tiếp JSON đến URL web app Apps Script.
- `apps-script/Code.gs` nhận yêu cầu trong `doPost()`, ánh xạ thao tác sang hàm xử lý và trả JSON theo dạng `{ok: true, result: ...}` hoặc `{ok: false, error: ...}`.
- Các thao tác quản trị vẫn phải kiểm tra token ở Apps Script. Không dựa vào việc ẩn nút hoặc kiểm tra quyền chỉ trong trình duyệt.

Khi thêm, đổi tên hoặc xóa thao tác được gọi từ giao diện, cập nhật đồng thời:

1. Hàm xử lý tương ứng trong `apps-script/Code.gs`.
2. Bảng ánh xạ `actions` trong `doPost()` của `apps-script/Code.gs`.
3. Tập `ACTIONS` trong `netlify/functions/api.js`.
4. Lời gọi ở `apps-script/Client.html`, nếu thao tác được dùng trong giao diện.

Tên thao tác và thứ tự tham số phải khớp ở cả `doPost()` và `ACTIONS`. Chỉ cho phép các thao tác cụ thể; không biến `doPost()` thành bộ gọi hàm tùy ý.

## Quy trình thay đổi giao diện hoặc tính năng

1. Sửa nguồn trong `apps-script/Index.html`, `Admin.html`, `Styles.html`, `Client.html` hoặc `Code.gs`.
2. Với thay đổi giao diện hoặc client, chạy `npm run build` để đồng bộ `public/`.
3. Đưa cả nguồn `apps-script/` và đầu ra `public/` đã cập nhật vào commit để hai bản triển khai dùng cùng giao diện.
4. Kiểm tra lời gọi Google Sheets, trạng thái loading và lỗi trả về. Với thao tác ghi, chỉ báo hoàn tất sau khi máy chủ phản hồi thành công.
5. Cập nhật bản triển khai Google Apps Script khi có thay đổi trong `Code.gs` hoặc template Apps Script.
6. Chỉ đẩy commit lên Git khi người dùng yêu cầu rõ ràng push hoặc triển khai cho lần thay đổi hiện tại. Nếu chưa có yêu cầu đó, dừng sau khi hoàn tất thay đổi cục bộ và báo rằng Netlify chưa được triển khai.

## Quyền push và triển khai

- Không tự ý push commit hoặc nhánh lên remote, kể cả khi các bước triển khai bên dưới có nhắc đến Git. Những bước đó mô tả quy trình khi người dùng đã yêu cầu triển khai; chúng không phải quyền push mặc định.
- Chỉ push khi người dùng yêu cầu rõ ràng trong cuộc trò chuyện hiện tại. Sau khi push, mới xem là đã yêu cầu Netlify triển khai tự động.

Nếu chỉ đổi giao diện, build Netlify vẫn cần thiết; bản Apps Script nhận template mới khi cập nhật deployment. Nếu đổi backend, deploy Apps Script trước rồi deploy Netlify để endpoint mới sẵn sàng cho frontend.

Hiện dự án chưa cấu hình `clasp` hoặc quy trình tự đẩy mã từ Git lên Apps Script. `npm run build` chỉ đồng bộ `apps-script/` sang `public/`; nó không cập nhật dự án Google Apps Script. Hãy đưa các file nguồn đã sửa vào Apps Script Editor, lưu, rồi cập nhật deployment như hướng dẫn bên dưới. Không ghi rằng hai nền tảng đã được triển khai chỉ vì lệnh build thành công.

## Chạy cục bộ

```bash
npm install
npm run build
npm start
```

Mở `http://localhost:3000/`. Lệnh `npm start` phục vụ `public/` và xử lý đường dẫn Netlify Function cục bộ. Máy cần kết nối Internet để gọi web app Apps Script. Có thể đặt cổng khác, ví dụ `PORT=3006 npm start`.

## Triển khai Google Apps Script

1. Mở dự án Apps Script gắn với bảng tính của ứng dụng.
2. Chép nội dung các file tương ứng từ `apps-script/` vào Apps Script Editor và lưu dự án. Giữ nguyên cấu hình triển khai và quyền hiện có.
3. Chọn **Deploy → Manage deployments**, sửa deployment Web app hiện có và tạo phiên bản mới.
4. Dùng URL Web app đang hoạt động làm endpoint cho Netlify. Khi cập nhật deployment hiện có, giữ nguyên URL để không phải đổi cấu hình Netlify.

Web app phải thực thi bằng tài khoản triển khai để ghi vào Google Sheets. Quyền truy cập công khai của Web app cho phép người đăng ký gửi biểu mẫu; dữ liệu quản trị cần tiếp tục được kiểm tra ở Apps Script.

## Triển khai Netlify

Deploy toàn bộ repository qua Git, không deploy riêng `public/`. `netlify.toml` đã cấu hình lệnh build, thư mục xuất bản `public/` và thư mục Function `netlify/functions/`.

Mặc định, `netlify/functions/api.js` dùng URL Apps Script hiện tại. Nếu URL thay đổi, đặt biến môi trường `APPS_SCRIPT_URL` trong cài đặt site Netlify thành URL `/exec` mới rồi triển khai lại. Không đưa token quản trị hoặc thông tin xác thực vào `public/`.

## Điểm cần giữ ổn định

- Không đổi cấu trúc cột hay tên sheet trong `Code.gs` mà không có bước tương thích với dữ liệu hiện có.
- Kiểm tra trùng lịch ở phía Apps Script, kể cả khi giao diện đã khóa khung giờ; backend là nơi quyết định cuối cùng.
- Giữ token quản trị và xác thực thao tác quản trị ở phía Apps Script.
- Khi sửa hàm `call()` trong `Client.html`, cập nhật chuỗi chuyển đổi tương ứng trong `scripts/sync-public.mjs`; build cố ý báo lỗi nếu không còn tìm thấy mẫu cũ.
- Không chỉnh sửa hoặc mở quyền chia sẻ Google Sheets chỉ để deploy giao diện. Netlify gọi Apps Script; người dùng không cần quyền truy cập trực tiếp vào bảng tính.
