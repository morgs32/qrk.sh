# QRK's download and update-prompt library

Researched **2026-11-06** against QRK's current source, installed packages, and official documentation. Scope: identify the library already responsible for downloading client builds and exposing update prompts. No runtime changes or browser verification were performed.

## Finding

**QRK already uses `vite-plugin-pwa` 2.0.0, backed by Workbox.** Its App manifest pins `vite-plugin-pwa` to `2.0.0` and `workbox-window` to `7.4.1`; the installed plugin reports those same package/version and Workbox dependency relationships. Sources: [App dependencies](../../apps/app/package.json), [installed plugin metadata](../../apps/app/node_modules/vite-plugin-pwa/package.json).

The plugin generates the service worker through Workbox's `generateSW`. QRK configures `registerType: "prompt"`, includes JS/CSS/HTML/WASM/fonts/images in its precache patterns, and manually generates the final worker after TanStack Start has emitted the SPA shell. Installation and caching are browser/service-worker work; the prompt is a notification that the update is waiting. Sources: [QRK build configuration](../../apps/app/vite.config.ts), [installed generation implementation](../../apps/app/node_modules/vite-plugin-pwa/dist/index.js), [official prompt behavior](https://vite-pwa-org.netlify.app/guide/prompt-for-update.html).

## Library behavior and QRK behavior

- **Registration and lifecycle events:** QRK imports `registerSW` from the plugin's `virtual:pwa-register` module. The installed implementation uses `workbox-window` to observe the waiting worker and send `SKIP_WAITING` when QRK invokes the returned update function. Workbox documents registration, lifecycle observation, and messaging as its window-side responsibilities. Sources: [QRK integration](../../apps/app/app/AppUpdatePrompt.tsx), [installed registration implementation](../../apps/app/node_modules/vite-plugin-pwa/dist/client/build/register.js), [Workbox Window documentation](https://developer.chrome.com/docs/workbox/modules/workbox-window).
- **Visible prompt:** QRK supplies the UI itself through Sonner: “Update available,” with “Reload” and “Later.” The plugin calls QRK's `onNeedRefresh`; it does not render a built-in dialog. Source: [AppUpdatePrompt](../../apps/app/app/AppUpdatePrompt.tsx), [official prompt integration](https://vite-pwa-org.netlify.app/guide/prompt-for-update.html).
- **Reload approval:** QRK uses the installed plugin's `onNeedReload` hook to reload only a document whose user approved it; another tab's activation otherwise shows the prompt. In the installed 2.0.0 implementation, the returned function's `_reloadPage` parameter is unused: activation is requested through `messageSkipWaiting()`, while the controlling event invokes `onNeedReload`. Sources: [QRK approval and callback](../../apps/app/app/AppUpdatePrompt.tsx), [installed registration implementation](../../apps/app/node_modules/vite-plugin-pwa/dist/client/build/register.js).
- **Additional cache policy:** QRK supplements Workbox with `offline-cache.js` to serve old immutable asset URLs and conservatively remove old build caches. Source: [QRK cache extension](../../apps/app/public/offline-cache.js).

QRK disables web-app manifest generation with `manifest: false`, while using the service worker and update lifecycle. A PWA library does not require QRK to enable an installation experience. Sources: [QRK options](../../apps/app/vite.config.ts), [official independent service-worker configuration](https://vite-pwa-org.netlify.app/guide/service-worker-without-pwa-capabilities.html).

## Implication

The existing library already supplies the download/update primitives. Draft-aware approval and any old-runtime handoff belong in QRK's application flow around activation; Node command recovery and SQL migration remain separate from this PWA integration. This is a scope recommendation, not an implementation. Exact callback behavior above follows the installed 2.0.0 source; the public guide currently labels itself 1.2.0.
