const RESERVED = new Set(["admin", "api"]);
const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const enc = new TextEncoder();
const J = (d, s = 200, h = {}) => Response.json(d, { status: s, headers: h });
const NOT_FOUND = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Không tìm thấy link</title><body style="font:16px system-ui;display:grid;place-items:center;min-height:100vh;margin:0;color:#12182B;background:#EDF0F7"><div style="text-align:center"><h1 style="font-size:56px;margin:0">404</h1><p>Link này không tồn tại, đã bị tắt hoặc đã hết hạn.</p><a href="https://nchxa.cyou" style="color:#3B3FEF">Về trang chủ</a></div>`;

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url), p = url.pathname;
    try {
      if (p.startsWith("/api/")) return await api(req, env, url);
      if (url.hostname !== env.SHORT_HOST) return env.ASSETS.fetch(req); // landing page
      if (p === "/") return Response.redirect(url.origin + "/admin/", 302);
      if (p.startsWith("/admin") || p.includes(".")) return env.ASSETS.fetch(req); // trang quản lý + file tĩnh
      return await go(decodeURIComponent(p.slice(1)), env, ctx); // link rút gọn
    } catch {
      return J({ error: "Lỗi máy chủ" }, 500);
    }
  },
};

/* ---------- Redirect công khai ---------- */
async function go(slug, env, ctx) {
  const r = await env.LINKS.get("l:" + slug, { type: "json", cacheTtl: 60 });
  if (!r || !r.on || (r.exp && r.exp < Date.now()))
    return new Response(NOT_FOUND, { status: 404, headers: { "Content-Type": "text/html;charset=utf-8" } });
  ctx.waitUntil(hit(env, slug)); // đếm lượt bấm sau khi đã trả kết quả
  return new Response(null, { status: 302, headers: { Location: r.url, "Cache-Control": "no-store" } });
}

async function hit(env, slug) {
  try {
    const r = await env.LINKS.get("l:" + slug, "json");
    if (r) { r.c = (r.c || 0) + 1; await save(env, slug, r); }
  } catch { /* chạm giới hạn ghi của KV thì bỏ qua, không ảnh hưởng redirect */ }
}

/* Giá trị lưu đầy đủ; metadata là bản rút gọn để liệt kê 1 lần mà không phải đọc từng key */
const save = (env, slug, r) =>
  env.LINKS.put("l:" + slug, JSON.stringify(r), { metadata: { ...r, url: r.url.slice(0, 450) } });

/* ---------- API quản lý ---------- */
async function api(req, env, url) {
  const m = req.method, p = url.pathname.slice(5);
  if (!env.ADMIN_PASSWORD) return J({ error: "Chưa đặt secret ADMIN_PASSWORD trên Cloudflare." }, 500);

  if (p === "login" && m === "POST") {
    const { password = "" } = await req.json().catch(() => ({}));
    if (!(await same(String(password), env.ADMIN_PASSWORD))) {
      await new Promise((r) => setTimeout(r, 600)); // làm chậm việc dò mật khẩu
      return J({ error: "Sai mật khẩu" }, 401);
    }
    const exp = Date.now() + 30 * 864e5;
    const token = exp + "." + (await sign(String(exp), env.ADMIN_PASSWORD));
    return J({ ok: true }, 200, { "Set-Cookie": `s=${token}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Strict` });
  }
  if (p === "logout") return J({ ok: true }, 200, { "Set-Cookie": "s=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict" });
  if (!(await authed(req, env))) return J({ error: "Chưa đăng nhập" }, 401);

  if (p === "links" && m === "GET") {
    const out = [];
    let cursor;
    do {
      const l = await env.LINKS.list({ prefix: "l:", cursor });
      for (const k of l.keys) out.push({ slug: k.name.slice(2), ...k.metadata });
      cursor = l.list_complete ? undefined : l.cursor;
    } while (cursor);
    return J(out.sort((a, b) => b.at - a.at));
  }

  if (p === "links" && m === "POST") {
    const b = await req.json().catch(() => ({}));
    const r = { url: "", title: "", on: true, exp: null, c: 0, at: Date.now() };
    const err = fill({ url: b.url, title: b.title, exp: b.exp }, r, env.SHORT_HOST);
    if (err) return J({ error: err }, 400);
    let slug = String(b.slug || "").trim();
    if (slug) {
      if (!/^[\w-]{2,40}$/.test(slug) || RESERVED.has(slug.toLowerCase()))
        return J({ error: "Alias chỉ gồm chữ, số, - và _ (2–40 ký tự)" }, 400);
      if (await env.LINKS.get("l:" + slug)) return J({ error: "Alias này đã được dùng" }, 409);
    } else {
      for (let i = 0; i < 5 && !slug; i++) {
        const s = Array.from(crypto.getRandomValues(new Uint8Array(6)), (x) => ALPHABET[x % 62]).join("");
        if (!(await env.LINKS.get("l:" + s))) slug = s;
      }
      if (!slug) return J({ error: "Không tạo được slug, hãy thử lại" }, 500);
    }
    await save(env, slug, r);
    return J({ slug, ...r }, 201);
  }

  const slug = /^links\/([\w-]+)$/.exec(p)?.[1];
  if (slug) {
    const r = await env.LINKS.get("l:" + slug, "json");
    if (!r) return J({ error: "Không tìm thấy link" }, 404);
    if (m === "GET") return J({ slug, ...r });
    if (m === "DELETE") { await env.LINKS.delete("l:" + slug); return J({ ok: true }); }
    if (m === "PATCH") {
      const err = fill(await req.json().catch(() => ({})), r, env.SHORT_HOST);
      if (err) return J({ error: err }, 400);
      await save(env, slug, r);
      return J({ slug, ...r });
    }
  }
  return J({ error: "Not found" }, 404);
}

/* ---------- Kiểm tra dữ liệu ---------- */
function fill(b, r, host) {
  if ("url" in b) {
    const u = cleanUrl(b.url, host);
    if (!u) return "Link đích không hợp lệ (chỉ nhận http/https, không rút gọn link của chính trang này)";
    r.url = u;
  }
  if ("title" in b) r.title = String(b.title || "").trim().slice(0, 60);
  if ("on" in b) r.on = !!b.on;
  if ("exp" in b) r.exp = b.exp ? +b.exp : null;
}

function cleanUrl(raw, host) {
  raw = String(raw || "").trim();
  if (!/^[a-z][a-z\d+.-]*:/i.test(raw)) raw = "https://" + raw;
  try {
    const u = new URL(raw);
    return /^https?:$/.test(u.protocol) && u.hostname !== host && u.href.length <= 2048 ? u.href : null;
  } catch { return null; }
}

/* ---------- Đăng nhập: cookie ký HMAC ---------- */
async function sign(msg, secret) {
  const k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const s = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(msg)));
  return btoa(String.fromCharCode(...s)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function same(a, b) { // so sánh không lộ thời gian
  const [x, y] = await Promise.all([sign("c", a), sign("c", b)]);
  let d = x.length ^ y.length;
  for (let i = 0; i < x.length; i++) d |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return d === 0;
}

async function authed(req, env) {
  const t = /(?:^|; )s=([^;]+)/.exec(req.headers.get("Cookie") || "")?.[1] || "";
  const [exp, sig] = t.split(".");
  return !!sig && +exp > Date.now() && (await same(sig, await sign(exp, env.ADMIN_PASSWORD)));
}
