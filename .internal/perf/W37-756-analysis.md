# W37-756 — Phân tích tốc độ OpenAffiliate

Ngày đo: 2026-09-14  
Production: `https://openaffiliate.dev`  
Baseline gốc: `web-vitals-openaffiliate.dev-2026-09-14.{json,md}`

## Kết luận ưu tiên

1. `/rankings` là lỗi có tín hiệu mạnh nhất: INP P75 216 ms, P90 654 ms.
   Trong 63 event có INP, Windows Chrome chiếm 44 event và có P75 490 ms,
   P90 894 ms. Đây không chỉ là một page ít traffic bị một mẫu làm đỏ.
2. `/content-lab` chưa đủ mẫu để kết luận trang nói chung chậm: chỉ 4 event có
   INP; ba Windows Chrome đều 40 ms, một Chrome iOS là 4.608 ms.
3. `/programs/replit` cũng chưa đủ mẫu: chỉ 4 event có INP; một Safari là
   1.952 ms, ba browser còn lại 32–280 ms.
4. `/categories` xanh ở P75 (82 ms). P90 657 ms đến từ 12 event có INP, trong
   đó 8 Windows Chrome có P75 246 ms/P90 895 ms. Cần giảm chi phí chung nhưng
   chưa có bằng chứng cho một interaction riêng của trang categories.

## Sai số cần nhớ khi đọc baseline

Cột `n` của `web-vitals-snapshot` là số event `$web_vitals`, không phải số mẫu
riêng của từng metric. PostHog flush các metric ở những thời điểm khác nhau, nên
`/rankings n=124` nhưng chỉ có 63 event mang INP; `/content-lab n=12` nhưng chỉ
có 4 event mang INP. Vì vậy dùng `n` để xếp traffic là đúng ở mức gần đúng, còn
quyết định sửa một metric phải query `..._value IS NOT NULL`.

Một nhóm outlier `/rankings` là Chrome 112/Windows từ một visitor (4 event,
P75 1.356 s), nhưng Chrome 151–152 vẫn có một số nhóm 478–1.237 ms. Không thể
gạt toàn bộ đuôi dài thành browser cũ hay bot.

## Nguyên nhân trong code và production bundle

- Global `SearchBar` import `@/lib/programs`, mà module này parse toàn bộ
  `src/lib/registry.json`: 1.792.241 byte thô, 216.718 byte gzip.
- Production `/rankings` tải khoảng 489 KB JavaScript nén; riêng chunk chứa
  registry là khoảng 205 KB.
- `/content-lab` import cùng full registry để lọc đồng bộ dù chỉ hiển thị tối
  đa 8 kết quả.
- `/rankings` từng giới hạn render mặc định còn 50 dòng, nhưng nút “Show all”
  đưa cả 760 `ProgramLogo` có state trở lại DOM trong một interaction. Điều đó
  tái tạo đúng long task mà bản sửa cũ muốn loại.
- PostHog SDK 1.376.0 chưa bật attribution mặc định, nên các mẫu cũ không cho
  biết interaction target và phần input/processing/presentation của INP.

## Thay đổi đang thực hiện

- Nav search và Content Lab query API cache sau khi người dùng gõ, không parse
  registry trên initial load/hydration.
- Các UI cần toàn bộ catalog (`/programs`, `/rankings`) dùng projection riêng;
  projection phải giữ parity 760 program, Affiliate Score, commission label và
  commission display, đồng thời có ngân sách gzip 70 KB. Projection hiện là
  551.735 byte thô/48.904 byte gzip, nhỏ hơn full registry khoảng 77% theo gzip.
- `/rankings` phân trang 50 dòng; không interaction nào render 760 dòng.
- Nâng PostHog và lưu attribution cho INP/LCP, không bật CLS attribution vì nó
  giữ detached DOM node trong App Router session dài.

## Tiêu chí đo sau deploy

- Build, lint và parity/size guard phải đạt trước PR.
- Ba lần Lighthouse mobile dùng production cũ và localhost mới chỉ là kiểm tra
  hỗ trợ, không phải before/after hợp lệ vì khác origin/CDN. Main-thread median
  giảm 1.249 → 1.118 ms và TBT 88 → 80 ms; LCP localhost không được dùng để
  kết luận. Đo lab thật phải chạy lại trên preview deployment cùng điều kiện.
- Sau deploy, chờ tối thiểu 20 mẫu INP cho page đáng kết luận; query count riêng
  từng metric.
- `/rankings`: INP P75 và P90 đều ≤200 ms.
- Các page family còn lại: đọc P75/P90 cùng attribution target; page dưới 20
  mẫu chỉ kết luận khi có thêm lab median hoặc đủ RUM.
