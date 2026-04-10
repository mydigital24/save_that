/* ── Save That – Service Worker ─────────────────────────────────────────── */
const CACHE  = 'save-that-v1';
const ASSETS = ['./', './index.html', './manifest.json', './icon.svg'];

/* ── Install: pre-cache app shell ──────────────────────────────────────── */
self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE).then((c) => c.addAll(ASSETS))
    );
    self.skipWaiting();
});

/* ── Activate: purge old caches ─────────────────────────────────────────── */
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
        )
    );
    self.clients.claim();
});

/* ── Fetch strategy ─────────────────────────────────────────────────────── */
self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);

    // Always bypass: Firebase, Google APIs, CDN scripts, browser extensions
    if (
        url.hostname.includes('firestore.googleapis.com') ||
        url.hostname.includes('firebase.googleapis.com') ||
        url.hostname.includes('identitytoolkit.googleapis.com') ||
        url.hostname.includes('securetoken.googleapis.com') ||
        url.hostname.includes('gstatic.com') ||
        url.hostname.includes('googleapis.com') ||
        url.hostname.includes('fonts.googleapis.com') ||
        url.hostname.includes('fonts.gstatic.com') ||
        url.protocol === 'chrome-extension:'
    ) {
        return; // let browser handle normally
    }

    // Only handle GET requests
    if (e.request.method !== 'GET') return;

    // Cache-first for same-origin assets (app shell)
    if (url.origin === self.location.origin) {
        e.respondWith(
            caches.match(e.request).then((cached) => {
                if (cached) {
                    // Return cache immediately AND refresh in background
                    const networkFetch = fetch(e.request)
                        .then((res) => {
                            if (res && res.ok) {
                                caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
                            }
                            return res;
                        })
                        .catch(() => {/* offline – ignore */});
                    return cached;
                }

                // Not cached yet – fetch and store
                return fetch(e.request)
                    .then((res) => {
                        if (res && res.ok) {
                            const clone = res.clone();
                            caches.open(CACHE).then((c) => c.put(e.request, clone));
                        }
                        return res;
                    })
                    .catch(() =>
                        // Ultimate fallback: serve index.html for navigation requests
                        e.request.mode === 'navigate'
                            ? caches.match('./index.html')
                            : new Response('Offline', {
                                  status: 503,
                                  statusText: 'Service Unavailable',
                              })
                    );
            })
        );
    }
});
