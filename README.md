# nchxa-hub

Một Worker duy nhất phục vụ:
- `nchxa.cyou/` → landing page (danh sách website, sửa tại `public/sites.json`)
- `nchxa.cyou/abc123` → link rút gọn (lưu bằng Cloudflare KV)
- `nchxa.cyou/admin/` → trang quản lý link

## Deploy (làm 1 lần)

1. Tạo repo GitHub mới, giải nén zip rồi push toàn bộ lên.
2. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Import a repository** → chọn repo → để mặc định → **Deploy**.
   (Wrangler tự tạo KV Namespace `LINKS` và tự gắn tên miền `nchxa.cyou` vì DNS nằm trên Cloudflare.)
3. Vào Worker `nchxa-hub` → **Settings** → **Variables and secrets** → **Add** → loại **Secret**,
   tên `ADMIN_PASSWORD`, giá trị là mật khẩu của bạn → **Deploy**.
4. Mở `https://nchxa.cyou/admin/` và đăng nhập.

## Cập nhật
- Thêm website mới: sửa `public/sites.json` rồi `git push`, Cloudflare tự deploy lại.
- Link rút gọn quản lý hoàn toàn trên trang `/admin/`, không cần push.

## Nếu gặp sự cố
- **Lỗi KV khi deploy**: tạo thủ công ở Storage & Databases → KV → Create, rồi thêm dòng `id = "<id>"` dưới `binding = "LINKS"` trong `wrangler.toml`.
- **Lỗi tên miền đã có bản ghi DNS**: xoá bản ghi A/AAAA/CNAME cũ của `nchxa.cyou` trong DNS rồi deploy lại.
- **Chạy thử trên máy**: `npm i`, tạo `.dev.vars` (copy từ `.dev.vars.example`), `npm run dev`.

## Lưu ý về KV
- Sửa/xoá/tắt link có thể mất tối đa ~1 phút để có hiệu lực ở mọi nơi.
- Gói free cho 1.000 lượt ghi/ngày; mỗi lượt bấm tính 1 lần ghi (đếm lượt bấm). Vượt mức thì chỉ ngừng đếm, redirect vẫn chạy.

## Tạo link không cần mật khẩu
- Ai vào `nchxa.cyou/admin/` cũng dán link và nhận link ngắn (alias ngẫu nhiên). Danh sách link của khách chỉ lưu trong trình duyệt của họ.
- Mật khẩu `ADMIN_PASSWORD` chỉ cần khi muốn xem mọi link, đặt alias, sửa, bật/tắt hoặc xoá (nút "Đăng nhập quản trị"). Link do khách tạo có nhãn "Tạo từ khách".
- Chống lạm dụng (khuyên bật): thêm vào cuối `wrangler.toml` rồi push, mỗi IP chỉ được tạo 10 link/phút:

```toml
[[ratelimits]]
name = "LIMITER"
namespace_id = "1001"
simple = { limit = 10, period = 60 }
```
