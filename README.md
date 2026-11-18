# HOATAM Student Assessment

Hệ thống quản lý và đánh giá học sinh tiểu học (hỗ trợ quy chuẩn Thông tư 27/2020/TT-BGDĐT), thiết kế theo mô hình **ngoại tuyến trước (Offline-first PWA)**, lưu trữ toàn bộ dữ liệu trực tiếp trên thiết bị thông qua **IndexedDB (Dexie.js)**, hỗ trợ nhập/xuất Excel, xuất báo cáo PDF tiếng Việt đầy đủ dấu, biểu đồ thống kê, sao lưu/khôi phục JSON và Trợ lý AI tham khảo.

---

## 1. Kiến trúc & Công nghệ

- **Giao diện & Điều hướng**: React 19, TypeScript, Vite 8, Tailwind CSS v4, React Router v7, Lucide Icons (`React.lazy` tách chunk theo từng phân hệ).
- **Cơ sở dữ liệu cục bộ**: Dexie.js + IndexedDB (`HoatamStudentAssessmentDB`, `DB_SCHEMA_VERSION = 7`, **23 bảng** có chỉ mục, nâng cấp version tự động giữ nguyên dữ liệu).
- **Ứng dụng ngoại tuyến (PWA)**: `vite-plugin-pwa` + Workbox (`dist/sw.js` + `dist/manifest.webmanifest`), precache toàn bộ HTML, JS chunks, CSS, biểu tượng PWA và bộ font PDF tiếng Việt (`DejaVuSans*.ttf`).
- **Nhập / Xuất dữ liệu**:
  - Đọc và ánh xạ Excel (`.xlsx`, `.xls`): SheetJS (`xlsx`).
  - Xuất Excel chuẩn 10 loại danh sách & báo cáo: `write-excel-file`.
  - Xuất PDF tiếng Việt đúng dấu: `jspdf` + `jspdf-autotable` kèm font nhúng `public/fonts/DejaVuSans*.ttf`.
- **Biểu đồ**: Recharts.
- **Trợ lý AI (tùy chọn khi có Internet)**: Express server (`server.ts`) gọi `@google/genai` qua `/api/ai/assistant`; khóa `GEMINI_API_KEY` chỉ lưu trên máy chủ, dữ liệu học sinh được ẩn danh hóa trước khi gửi.

---

## 2. 18 Phân hệ chức năng

1. **Tổng quan** (`/`) — Bảng điều khiển nhanh, số liệu theo năm học & phạm vi người dùng.
2. **Việc của tôi** (`/cong-viec-cua-toi`) — Không gian cá nhân của giáo viên: vai trò, lớp chủ nhiệm, lớp/môn bộ môn, thời khóa biểu hôm nay/tuần này.
3. **Năm học** (`/nam-hoc`) — Quản lý năm học, mốc học kỳ và chọn năm học hiện hành.
4. **Giáo viên** (`/giao-vien`) — Hồ sơ đa vai trò (một giáo viên có thể đồng thời là GVCN, GVBM, Quản lý chuyên môn, Quản trị viên), hồ sơ tổng hợp 360°.
5. **Phân công nhiệm vụ** (`/phan-cong`) — Phân công đa lớp, đa môn, theo dõi lịch sử thay đổi phân công mà vẫn giữ nguyên người ghi nhận trên các đánh giá cũ.
6. **Lớp học** (`/lop-hoc`) — Quản lý lớp tiểu học Khối 1–5 và lưu trữ lớp.
7. **Học sinh** (`/hoc-sinh`) — Hồ sơ học sinh, chuyển lớp giữ nguyên toàn bộ lịch sử đánh giá cũ và ghi nhận `studentClassHistory`.
8. **Môn học** (`/mon-hoc`) — Danh mục môn học & hoạt động giáo dục.
9. **Tiêu chí & Quy tắc** (`/tieu-chi`) — Tiêu chí hằng ngày, tiêu chí môn học/phẩm chất/năng lực và bộ quy tắc đánh giá tùy biến (tách biệt thang `T / H / C` cho môn học và `T / Đ / C` cho phẩm chất & năng lực).
10. **Thời khóa biểu** (`/thoi-khoa-bieu`) — Một giáo viên có thể sở hữu nhiều thời khóa biểu theo tuần/đợt, cấu hình thứ 2–thứ 6 hoặc thứ 7, tiết học và phòng học.
11. **Đánh giá hằng ngày** (`/danh-gia-hang-ngay`) — Dành cho GVCN (nhập từng học sinh hoặc bảng cả lớp chung nguồn dữ liệu, lưu lịch sử chỉnh sửa).
12. **Đánh giá theo tiết học** (`/danh-gia-tiet-hoc`) — Dành cho GVBM đi trực tiếp từ tiết dạy trên thời khóa biểu, hỗ trợ cả hai chế độ nhập, lưu lịch sử chỉnh sửa.
13. **Đánh giá định kỳ** (`/danh-gia-dinh-ky`) — Quản lý đợt đánh giá, tổng hợp minh chứng, áp dụng quy tắc, nhập và khóa kỳ đánh giá chính thức.
14. **Trợ lý AI** (`/tro-ly-ai`) — Gợi ý nhận xét và phân tích xu hướng (chỉ gợi ý tham khảo, không tự xác nhận kết quả; tắt/bật ở Cài đặt).
15. **Báo cáo – thống kê** (`/bao-cao`) — Báo cáo theo học sinh, lớp, giáo viên, môn học và tổng hợp toàn trường; tách bạch dữ liệu thường xuyên và định kỳ chính thức.
16. **Nhập / Xuất dữ liệu** (`/nhap-xuat`) — Nhập Excel **6 loại** (Giáo viên, Lớp, Học sinh, Môn học, Phân công, Thời khóa biểu) có tải mẫu, xem trước, ánh xạ cột, kiểm tra trùng; xuất Excel **10 loại** và xuất PDF tiếng Việt.
17. **Sao lưu – khôi phục** (`/sao-luu`) — Sao lưu JSON v2 có mã kiểm tra toàn vẹn (checksum), đối chiếu từng bảng trước khi khôi phục theo chế độ Bổ sung hoặc Thay thế toàn bộ.
18. **Cài đặt** (`/cai-dat`) — Thông tin trường học, giao diện Sáng/Tối, cài đặt PWA, kiểm tra trạng thái Service Worker/cập nhật, bật/tắt AI và nhật ký thao tác.

---

## 3. Hướng dẫn sử dụng thực tế

### Bước 1: Khởi chạy ứng dụng
```bash
npm install
npm run dev
```
Truy cập `http://localhost:3000`. Nếu muốn dùng Trợ lý AI trực tuyến, tạo tệp `.env` từ `.env.example` và khai báo `GEMINI_API_KEY` (không bắt buộc cho toàn bộ 17 phân hệ còn lại).

### Bước 2: Nhập dữ liệu ban đầu
- Tạo **Năm học** tại `/nam-hoc` (hoặc chọn năm học đang hoạt động ở thanh tiêu đề).
- Vào **Nhập / Xuất dữ liệu** (`/nhap-xuat`): tải tệp mẫu Excel cho **Môn học**, **Lớp học**, **Giáo viên**, **Học sinh**, **Phân công**, **Thời khóa biểu**.
- Ở mỗi lần nhập, kiểm tra bảng xem trước và cột cảnh báo trùng mã trước khi bấm **Xác nhận nhập**.

### Bước 3: Phân công giáo viên & Thời khóa biểu
- Tại `/giao-vien`, gán nhiều vai trò cho cùng một giáo viên nếu cần (ví dụ vừa `GVCN` vừa `GVBM`).
- Tại `/phan-cong`, phân công giáo viên phụ trách lớp chủ nhiệm và/hoặc nhiều lớp, nhiều môn bộ môn.
- Tại `/thoi-khoa-bieu`, tạo một hoặc nhiều thời khóa biểu theo tuần và thêm từng tiết học.

### Bước 4: Đánh giá hằng ngày, theo tiết & định kỳ
- **GVCN** mở `/danh-gia-hang-ngay`: chọn lớp chủ nhiệm, ngày đánh giá; nhập từng học sinh hoặc nhập nhanh toàn lớp.
- **GVBM** mở `/danh-gia-tiet-hoc` (hoặc `/viec-cua-toi`): chọn tiết học trên thời khóa biểu để đánh giá và sửa khi cần (hệ thống lưu vết lịch sử chỉnh sửa).
- Khi đến kỳ kiểm tra, mở `/danh-gia-dinh-ky` để tổng hợp kết quả định kỳ chính thức và nhấn **Khóa kỳ** khi đã chốt.

### Bước 5: Xuất báo cáo & Sao lưu định kỳ
- Vào `/bao-cao` hoặc `/nhap-xuat` để xuất **Excel** hoặc **PDF tiếng Việt** có tên trường, năm học, người lập và khu vực chữ ký.
- **Quan trọng**: Vào `/sao-luu` để tải tệp **Sao lưu JSON** lưu trữ ở ổ đĩa ngoài hoặc bộ nhớ đám mây của nhà trường trước khi đổi máy hoặc xóa bộ nhớ trình duyệt.

---

## 4. Kiểm thử, Build Production & Triển khai (Deployment)

### Kiểm tra mã nguồn & Build
```bash
npm run lint
npm run build
```
Thư mục `dist/` sau khi build sẽ bao gồm:
- `dist/index.html`, các JS chunks đã được tách theo route và thư viện, CSS đã nén.
- `dist/sw.js` và `dist/workbox-*.js` (Service Worker ngoại tuyến).
- `dist/manifest.webmanifest`, các biểu tượng PWA và `dist/fonts/DejaVuSans*.ttf` được precache sẵn để xuất PDF tiếng Việt khi mất mạng.

### Cách triển khai thực tế
1. **Triển khai tĩnh (Static HTTPS Hosting — khuyến nghị nếu không dùng AI server-side)**  
   Tải toàn bộ nội dung thư mục `dist/` lên Netlify, Vercel, Cloudflare Pages hoặc Nginx. Cấu hình rewrite mọi đường dẫn SPA về `/index.html` (HTTPS bắt buộc để Service Worker và cài đặt PWA hoạt động).
2. **Triển khai Full-Stack (bao gồm Trợ lý AI `/api/ai/assistant`)**  
   ```bash
   npm run build
   NODE_ENV=production GEMINI_API_KEY=your_key PORT=3000 npm run start
   ```
   Cổng mặc định là `3000`, máy chủ Express phục vụ cả API `/api/*` và bản dựng tĩnh `dist/` với SPA fallback.

### Hướng dẫn cập nhật ứng dụng PWA
- Khi triển khai phiên bản mới lên máy chủ, Service Worker (`registerType: 'autoUpdate'`) tự động tải bản mới và kích hoạt an toàn mà **không làm mất dữ liệu trong IndexedDB**.
- Người dùng cũng có thể mở **Cài đặt → Kiểm tra cập nhật ứng dụng** (hoặc nhấn nút **Cập nhật mới** nếu xuất hiện trên thanh tiêu đề) để kiểm tra và tải lại ngay.

---

## 5. Bảo mật, Phân quyền & Các giới hạn hiện tại

1. **Lưu trữ cục bộ theo trình duyệt và thiết bị**  
   Dữ liệu nằm trong IndexedDB của trình duyệt đang dùng, không tự đồng bộ giữa các máy tính hoặc điện thoại khác nhau. Người dùng cần xuất tệp sao lưu `.json` để chuyển dữ liệu sang thiết bị khác.
2. **Chế độ chuyển hồ sơ trên thanh tiêu đề không phải xác thực bảo mật đa người dùng**  
   Bộ chọn `Quản trị viên / Giáo viên` hỗ trợ kiểm tra phạm vi lớp, môn, tiết dạy và ẩn các thao tác quản trị ngay trên thiết bị dùng chung, **không thay thế cơ chế đăng nhập mật khẩu/SSO trên môi trường nhiều thiết bị**.
3. **Trợ lý AI chỉ hoạt động khi trực tuyến và có `GEMINI_API_KEY` phía máy chủ**  
   Dữ liệu gửi lên AI đã được loại bỏ họ tên, mã học sinh, ngày sinh và thông tin phụ huynh; nếu thiết bị mất mạng hoặc Quản trị viên tắt AI trong Cài đặt, toàn bộ phần mềm vẫn hoạt động bình thường.
4. **Rủi ro khi người dùng tự xóa dữ liệu trình duyệt**  
   Xóa Site Data / Clear Browser Storage sẽ xóa IndexedDB cục bộ; luôn giữ bản sao lưu `.json` định kỳ ở nơi an toàn.
