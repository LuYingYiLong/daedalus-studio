const CACHE_NAME = "daedalus-remote-v2";

self.addEventListener("install", () => {
	self.skipWaiting();
});

self.addEventListener("activate", (event) => {
	event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))));
	self.clients.claim();
});

self.addEventListener("fetch", (event) => {
	const request = event.request;
	if (request.method !== "GET") return;
	const url = new URL(request.url);
	if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
	if (url.pathname.startsWith("/assets/")) {
		event.respondWith(caches.open(CACHE_NAME).then(async (cache) => {
			try {
				const response = await fetch(request, { cache: "no-store" });
				if (response.ok) await cache.put(request, response.clone());
				return response;
			} catch (error) {
				const cached = await cache.match(request);
				if (cached) return cached;
				throw error;
			}
		}));
		return;
	}
});
