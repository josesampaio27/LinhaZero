// Offline support. Network first: online the app is always current; offline it serves the last copy it saw.
// Same-origin GETs only; the API (/api) is live data and is never cached.
// Registered as sw.js?v=<build>: each deploy installs a new worker with its own cache and drops the old ones.
const CACHE = `linha-zero-${new URL(location.href).searchParams.get("v") ?? "dev"}`;

/**
 * This worker's cache, or null once a newer worker has deleted it: an outgoing worker still answers requests
 * while the new one takes over, and must not bring its old cache back.
 */
const ownCache = async () => ((await caches.has(CACHE)) ? caches.open(CACHE) : null);

/** Every zone and demo scenario (about 600 KB), so any of them opens offline, not only those seen online. */
async function cacheData() {
  const cache = await caches.open(CACHE);
  const get = async (url) => {
    const res = await fetch(url, { cache: "no-cache" });
    if (res.status === 200) await cache.put(url, res.clone());
    return res;
  };
  const [scenarios, grids] = await Promise.all([get("/scenarios/index.json").then((r) => r.json()), get("/grids/index.json").then((r) => r.json())]);
  await Promise.allSettled([
    ...scenarios.map((s) => get(`/scenarios/${encodeURIComponent(s.name)}.json`)),
    ...grids.map(async (g) => {
      const header = await (await get(`/grids/${encodeURIComponent(g.name)}/header.json`)).json();
      await Promise.allSettled(Object.values(header.layers).map((file) => get(`/grids/${g.name}/${file}`)));
    }),
  ]);
}

self.addEventListener("install", (e) => {
  self.skipWaiting();
  // The cache is created here even if the data fails: ownCache() relies on it existing.
  e.waitUntil(caches.open(CACHE).then(() => cacheData().catch(() => {}))); // offline data is a bonus: never block the install on it
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// The page sends the files it loaded before this worker took control (the app itself, its worker).
self.addEventListener("message", (e) => {
  // One by one: addAll would drop everything if a single file failed.
  if (Array.isArray(e.data?.cache)) e.waitUntil(ownCache().then((c) => c && Promise.allSettled(e.data.cache.map((u) => c.add(u)))));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.status === 200) {
          const copy = res.clone();
          e.waitUntil(ownCache().then((c) => c?.put(req, copy)));
        }
        return res;
      })
      // ignoreVary: module scripts carry an Origin header the pre-cached copies did not have.
      .catch(async () => (await caches.match(req, { ignoreVary: true })) ?? (req.mode === "navigate" ? caches.match("/") : Response.error())),
  );
});
