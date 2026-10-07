// يحفظ ملفات الموقع ليفتح ويعمل بدون إنترنت
// ملفات الموقع: الشبكة أولًا ثم النسخة المحفوظة (لتصلك التحديثات فورًا)
// مكتبات CDN ذات الإصدار الثابت (Excel، Firebase، الخطوط): المحفوظة أولًا
const CACHE = "rentbook-v3";
const SHELL = ["./", "index.html", "firebase-config.js", "manifest.webmanifest", "icon.svg"];
const CDN = ["cdnjs.cloudflare.com", "www.gstatic.com", "fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(e.request)
        .then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return res; })
        .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match("index.html")))
    );
  } else if (CDN.includes(url.hostname)) {
    e.respondWith(
      caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
        if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
        return res;
      }))
    );
  }
});
