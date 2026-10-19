// App shell only. Never caches API responses or anything about students. The sample data is
// compiled into the JavaScript bundle, and practice data the user enters lives in local storage
// (see src/data/workspace.ts), not in this cache.
const CACHE = "goalline-shell-v1";
// Paths are relative to the service worker scope so the app works under a repository subpath.
const ROOT = new URL("./", self.registration.scope).pathname;
const SHELL = [ROOT, ROOT + "manifest.webmanifest", ROOT + "icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  // Anything under /api is never cached or answered from cache.
  if (url.pathname.startsWith(ROOT + "api/")) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && (req.mode === "navigate" || url.pathname.startsWith(ROOT + "assets/"))) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req.mode === "navigate" ? ROOT : req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req.mode === "navigate" ? ROOT : req).then((r) => r ?? Response.error()),
      ),
  );
});
