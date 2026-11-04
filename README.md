# Lịch tập lái xe — Google Sheets

Phiên bản hiện tại nằm trong thư mục [`apps-script`](./apps-script). Web app Google Apps Script lưu lịch vào [bảng tính Google Sheets này](https://docs.google.com/spreadsheets/d/1SeeNpu1kZIt8nAqD_7lfzi_4z14t0Pm_96_tsfbsf2Q/edit). Dự án Apps Script gắn với bảng tính: [Lịch tập lái xe - Google Sheets](https://script.google.com/home/projects/1EOqjlNz-pXtR8B9fgIB8mnqva2zHelSlbQd9IrtaplaQZRqcrl7uJ2td/edit).

Trang đăng ký cho phép chọn ngày, tên thầy, hạng xe, xe, một hoặc nhiều khung giờ và tên học viên. Hệ thống từ chối khi cùng ngày, cùng xe và trùng ít nhất một khung giờ. Trang quản trị yêu cầu mật khẩu `12345678` mỗi lần mở, cho phép thêm/sửa/xóa/lọc/thống kê và xuất Excel. Mật khẩu được kiểm tra trong Apps Script; dữ liệu quản trị chỉ được trả về sau khi đăng nhập. Khi gửi, sửa hoặc xóa, lớp loading chỉ biến mất sau khi Google Sheets phản hồi và danh sách được cập nhật.

## Link sử dụng

- [Trang đăng ký](https://script.google.com/macros/s/AKfycbz1yieMmCOnDdmFOGQ8rp-cjtwf-QMeTk0ff_jtfecBtF_EbK6_UdcCIxW6YGNQ1PTXLw/exec)
- [Trang quản trị](https://script.google.com/macros/s/AKfycbz1yieMmCOnDdmFOGQ8rp-cjtwf-QMeTk0ff_jtfecBtF_EbK6_UdcCIxW6YGNQ1PTXLw/exec?page=admin)

Bản chính thức đã được triển khai chạy bằng quyền của chủ sở hữu và cho phép bất kỳ ai có link gửi đăng ký mà không cần tài khoản Google. `npm start` tại thư mục này mở một máy chủ cục bộ chuyển tiếp sang bản Google Sheets.

Bảng tính hiện được đặt ở chế độ **Hạn chế** để người có link không sửa hoặc đọc trực tiếp dữ liệu ngoài web app. Chủ sở hữu vẫn mở được bảng tính. Phiên bản Node/Excel cũ nằm ở `server.js` và `public/` để tham khảo; chỉ chạy khi chủ động dùng `npm run legacy:excel`. File `.xlsx` cũ được giữ nguyên.
