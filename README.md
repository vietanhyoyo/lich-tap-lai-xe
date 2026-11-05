# Lịch tập lái xe

Ứng dụng đăng ký lịch tập lái xe lưu dữ liệu trong [Google Sheets](https://docs.google.com/spreadsheets/d/1SeeNpu1kZIt8nAqD_7lfzi_4z14t0Pm_96_tsfbsf2Q/edit). Trang đăng ký có lịch theo tháng, hiển thị xe và khung giờ đã đặt, cho phép nhập tên giáo viên trực tiếp. Trang quản trị có đăng nhập bằng mật khẩu, quản lý lịch, giáo viên, xe và khung giờ, lọc, thống kê và xuất Excel. Google Apps Script kiểm tra trùng ngày, xe và khung giờ trước khi lưu.

## Deploy trên Netlify

Deploy **toàn bộ thư mục dự án** `lich-tap-lai-xe` qua Git repository trên [Netlify](https://app.netlify.com/). File [`netlify.toml`](./netlify.toml) đã cấu hình build command `npm run build`, publish directory `public` và functions directory `netlify/functions`. Netlify sẽ tự chạy build khi deploy. Không kéo thả riêng thư mục `public` vì trang cần Netlify Function để gọi Google Apps Script.

Các bước:

1. Đưa toàn bộ dự án lên một Git repository.
2. Trong Netlify, chọn **Add new site → Import an existing project** và kết nối repository đó.
3. Nếu repository chứa nhiều dự án, đặt **Base directory** là `lich-tap-lai-xe`; nếu repository chỉ chứa dự án này, để trống.
4. Giữ các thông số trong `netlify.toml`, rồi deploy.

Trang đăng ký ở `/`, trang quản trị ở `/admin.html` hoặc `/admin`. Netlify Function tại `/.netlify/functions/api` chuyển yêu cầu đến [web app Apps Script](https://script.google.com/macros/s/AKfycbz1yieMmCOnDdmFOGQ8rp-cjtwf-QMeTk0ff_jtfecBtF_EbK6_UdcCIxW6YGNQ1PTXLw/exec). Nếu URL web app thay đổi, đặt biến môi trường `APPS_SCRIPT_URL` trong Netlify rồi deploy lại. Web app Apps Script cần được triển khai với quyền chủ sở hữu và cho phép người có link truy cập để người dùng không phải đăng nhập Google. Dữ liệu quản trị vẫn yêu cầu mật khẩu của ứng dụng.

## Phát triển cục bộ

```bash
npm install
npm run build
npm start
```

Mở `http://localhost:3000/`. Máy chủ cục bộ phục vụ `public` và chạy cùng Netlify Function, nên cần kết nối Internet để làm việc với Google Sheets. Có thể đổi cổng bằng `PORT=3006 npm start`.

Các file trong `public/` được tạo từ `apps-script/Index.html`, `Admin.html`, `Styles.html` và `Client.html` bằng `npm run build`. Khi sửa giao diện, sửa nguồn trong `apps-script/` rồi chạy lại build để đồng bộ phiên bản Netlify. Phần xử lý Google Sheets nằm ở `apps-script/Code.gs` và cần cập nhật bản triển khai Apps Script khi thay đổi.

Phiên bản Node/Excel cũ được giữ trong `legacy-public/` và `server.js`; chạy riêng bằng `npm run legacy:excel`.
