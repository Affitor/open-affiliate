# OpenAffiliate manager — START HERE

Cập nhật: 2026-09-14  
Manager: `cos-oa`  
Ticket đang làm: W37-756 — tốc độ tải trang

## Trạng thái

- Branch: `perf/w37-756-web-vitals`
- Production chưa được đổi; merge/deploy `main` cần Sơn.
- Baseline 30 ngày:
  `.internal/perf/web-vitals-openaffiliate.dev-2026-09-14.{json,md}`
- Phân tích và quyết định:
  `.internal/perf/W37-756-analysis.md`

## Điều đã xác nhận

- `/rankings` là lỗi INP đáng tin nhất: P75 216 ms/P90 654 ms; 63 event có
  INP, trong đó Windows Chrome có 44.
- Tool snapshot ghi `n` theo event `$web_vitals`, không phải count riêng từng
  metric. Khi ra quyết định phải thêm `..._value IS NOT NULL`.
- Full registry 1,79 MB từng vào initial JS của mọi trang qua global SearchBar.
- Nút “Show all” của rankings vẫn render 760 stateful rows trong một lần.
- Các page đỏ còn lại trong ảnh chủ yếu có 3–15 event tổng; Content Lab và
  Replit mỗi trang chỉ có 4 event mang INP, chưa đủ để kết luận riêng.

## Patch hiện tại

- SearchBar và Content Lab gọi `/api/programs` sau khi gõ, không import registry
  vào initial client bundle.
- `/programs`, `/rankings`, `/submit` dùng client projection 760 program; guard
  khóa parity score/commission và ngân sách ≤70 KB gzip (hiện ~49 KB).
- Rankings phân trang 50 rows, không còn đường render 760 rows một interaction.
- PostHog được nâng và capture attribution cho INP/LCP.
- Build Next.js 16.2.4 đạt 884 static pages; typecheck và lint đạt (23 warning
  có sẵn, 0 error); smoke test năm route và search API đạt.

## Việc kế tiếp

1. Nhận review độc lập và sửa mọi finding.
2. Gửi Sơn link PR để duyệt merge/deploy production.
3. Sau deploy, chờ ít nhất 20 mẫu INP/page rồi chạy:
   `node ~/cos/bin/web-vitals-snapshot --project 439973 --host openaffiliate.dev --days 30 --out .internal/perf --compare <baseline.json>`
4. Query count riêng metric và dùng attribution target để xử lý page còn vàng/
   đỏ; không kết luận các page ít mẫu chỉ từ P90.
