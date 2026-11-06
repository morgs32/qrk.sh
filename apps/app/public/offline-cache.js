// Each build retains its own precache while another tab may still need its chunks.
const qrkCachePrefix = "__QRK_CACHE_PREFIX__";

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith("/assets/")) return;
  if (event.request.method !== "GET") return;
  event.respondWith(
    (async () => {
      const names = (await caches.keys()).filter((name) => name.startsWith("qrk-app-"));
      for (const name of names) {
        // Immutable build assets do not vary with module-request Origin headers.
        const cached = await (await caches.open(name)).match(event.request, { ignoreVary: true });
        if (cached) return cached;
      }
      return fetch(event.request);
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "QRK_APP_VERSION" || typeof event.data.moduleUrl !== "string") return;
  const moduleUrl = new URL(event.data.moduleUrl);
  if (moduleUrl.origin !== self.location.origin || !moduleUrl.pathname.startsWith("/assets/"))
    return;
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: "window" });
      if (clients.length !== 1 || clients[0].id !== event.source?.id) return;
      const names = await caches.keys();
      // Check after taking the cache snapshot so a newly installing build cannot be deleted.
      if (self.registration.installing || self.registration.waiting) return;
      const current = names.find((name) => name.startsWith(`${qrkCachePrefix}-precache-`));
      if (!current || !(await (await caches.open(current)).match(moduleUrl.href))) return;
      await Promise.all(
        names
          .filter((name) => name !== current && name.startsWith("qrk-app-"))
          .map((name) => caches.delete(name)),
      );
    })(),
  );
});
