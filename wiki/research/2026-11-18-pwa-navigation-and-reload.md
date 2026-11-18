# App navigation, cached assets, and reload

An online protected document request reaches Clerk before the host sends the
generic SPA shell. The service worker can still serve the shell's immutable
JavaScript, CSS, fonts and WASM from the precache. When the document fetch fails
because the network is unavailable, Workbox can return the precached shell.
A redirect or an HTTP error from the server is a response to pass through. This
lets QRK keep offline startup for eligible remembered users. The document request
adds a network round trip on online repeat visits.
[Workbox app shell guidance](https://developer.chrome.com/docs/workbox/app-shell-model)
and [fallback responses](https://developer.chrome.com/docs/workbox/managing-fallback-responses).

Vercel Routing Middleware can authenticate protected App document requests
before the existing rewrite to `/index.html`. Clerk's backend SDK distinguishes
signed-in, signed-out and handshake states. Handshake redirects and cookies must
reach the browser before QRK decides the user needs to go to Web's sign-in page.
Clerk Auth responses and request-specific documents stay out of Cache Storage.
[Vercel Routing Middleware](https://vercel.com/docs/routing-middleware)
and [Clerk request authentication](https://clerk.com/docs/reference/backend/authenticate-request).

QRK keeps its existing Vite PWA prompt. The browser downloads an update, then the
app offers Reload and Later. Worker activation is origin-wide. A tab that chooses
Later keeps running and can use its older hashed assets. A new online visit can
receive the latest shell independently of the prompt in an already-open tab.
[Vite PWA update prompts](https://vite-pwa-org.netlify.app/guide/prompt-for-update.html)
and [Workbox update handling](https://developer.chrome.com/docs/workbox/handling-service-worker-updates).

QRK keeps warning about unsaved forms and active uploads. Compatible reloads
recover commands retained by the Node or successfully persisted in the tab
journal. An empty Node queue cannot tell whether the tab holds unrecovered work,
and a remote confirmation requirement would make Reload unavailable offline.
See [Plan 054](../archive/plans/054-plan-client-updates-and-reload-durability.md).
