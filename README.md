# nchxa-hub

Một Worker duy nhất phục vụ:
- `nchxa.cyou` → landing page (danh sách website, sửa tại `public/sites.json`)
- `go.nchxa.cyou` → rút gọn link (`/abc123`) và trang quản lý (`/admin/`), lưu bằng Cloudflare KV

## Deploy (làm 1 lần)

1. Tạo repo GitHub mới, giải nén zip rồi push toàn bộ lên.
2. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Import a repository** → chọn repo → để mặc định → **Deploy**.
   (Wrangler tự tạo KV Namespace `LINKS` và tự gắn 2 tên miền vì DNS nằm trên Cloudflare.)
3. Vào Worker `nchxa-hub` → **Settings** → **Variables and secrets** → **Add** → loại **Secret**,
   tên `ADMIN_PASSWORD`, giá trị là mật khẩu của bạn → **Deploy**.
4. Mở `https://go.nchxa.cyou/admin/` và đăng nhập.

## Cập nhật
- Thêm website mới: sửa `public/sites.json` rồi `git push`, Cloudflare tự deploy lại.
- Link rút gọn quản lý hoàn toàn trên trang `/admin/`, không cần push.

## Nếu gặp sự cố
- **Lỗi KV khi deploy**: tạo thủ công ở Storage & Databases → KV → Create, rồi thêm dòng `id = "<id>"` dưới `binding = "LINKS"` trong `wrangler.toml`.
- **Lỗi tên miền đã có bản ghi DNS**: xoá bản ghi A/AAAA/CNAME cũ của `nchxa.cyou` hoặc `go` trong DNS rồi deploy lại.
- **Chạy thử trên máy**: `npm i`, tạo `.dev.vars` (copy từ `.dev.vars.example`), `npm run dev`.

## Lưu ý về KV
- Sửa/xoá/tắt link có thể mất tối đa ~1 phút để có hiệu lực ở mọi nơi.
- Gói free cho 1.000 lượt ghi/ngày; mỗi lượt bấm tính 1 lần ghi (đếm lượt bấm). Vượt mức thì chỉ ngừng đếm, redirect vẫn chạy.
