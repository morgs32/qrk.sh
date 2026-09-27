# LiveStore runtime integration compared with QRK

Researched 2026-09-27 against LiveStore v0.4.0. This is a comparison, not an implementation plan. No LiveStore migration or Zerospin upstream fix was applied.

## Browser worker asset ownership

LiveStore asks the app to import its dedicated worker using `?worker` and the package's shared worker using `?sharedworker`, then pass both constructors to `makePersistedAdapter`. Its API documentation explicitly attributes the app-level shared-worker import to a Vite limitation. This makes the worker entry visible to the application's bundler rather than requiring a library-owned absolute URL to be manually routed.

Sources: [released setup example](https://github.com/livestorejs/livestore/blob/v0.4.0/docs/src/content/_assets/code/getting-started/react-web/store.ts), [adapter options](https://docs.livestore.dev/api/adapter-web/type-aliases/webadapteroptions/).

QRK currently has Next on port 3000 forwarding to Vite on 3001 with `/assets/` as its base. Zerospin's browser connection instead creates a SharedWorker at `/__zerospin/node-worker.js`; its Vite plugin serves that exact root path. Forwarding it to `/assets/__zerospin/node-worker.js` produced HTML. The explicit worker/WASM rewrites repair this mismatch. LiveStore's bundler-owned entry avoids that particular hidden URL contract, but an app retaining a Next-to-Vite proxy must still forward the generated assets correctly. That last statement is an integration inference, not a claim that LiveStore supports this exact QRK topology automatically.

Local evidence: `apps/web/next.config.ts`, `apps/studio/vite.config.ts`, `vendor/zerospin/packages/browser/src/connectBrowserNode.ts`, and `vendor/zerospin/packages/browser/src/nodeWorkerPlugin.ts`.

## SQLite runtime separation

LiveStore exposes browser and Cloudflare SQLite modules and a conditional `load-wasm` export. The `workerd` condition precedes browser/worker conditions. Its workerd loader imports a compiled WASM module and instantiates it explicitly; its browser loader uses the ordinary wa-sqlite factory.

Sources: [package exports](https://github.com/livestorejs/livestore/blob/v0.4.0/packages/@livestore/sqlite-wasm/package.json), [workerd loader](https://github.com/livestorejs/livestore/blob/v0.4.0/packages/@livestore/sqlite-wasm/src/load-wasm/mod.workerd.ts), [browser loader](https://github.com/livestorejs/livestore/blob/v0.4.0/packages/@livestore/sqlite-wasm/src/load-wasm/mod.browser.ts).

The selected wa-sqlite JavaScript glue uses `import.meta.url` to locate its module directory, without sql.js's unconditional `self.location.href` read. This matters independently of supplying `instantiateWasm`: Zerospin already supplies that callback, but sql.js's browser entry fails before reaching it in a WorkerGlobalScope without location.

Source: [released wa-sqlite glue](https://github.com/livestorejs/livestore/blob/v0.4.0/packages/@livestore/wa-sqlite/dist/wa-sqlite.mjs). Local evidence: `vendor/zerospin/packages/system-worker/src/AggregateActorVersionRepo/validateCommands/makeActorSnapshotDb.ts` and the isolated sql.js reproduction from this chat. The proposed explicit sql.js entry was tested in Node with WorkerGlobalScope present and location absent; its workerd behavior remains unverified.

This separation still depends on correct bundler conditions: [Cloudflare workers-sdk issue 10978](https://github.com/cloudflare/workers-sdk/issues/10978) records the workerd condition incorrectly selecting LiveStore's Cloudflare loader in browser code. LiveStore has faced this class of integration failure too.

## Development server and sync routing

LiveStore's released React/Cloudflare example uses the Cloudflare Vite plugin, ESM worker output, and a sync URL derived from `globalThis.location.origin` plus `/sync`. The example explicitly uses `/sync` to avoid static assets intercepting root requests. This integrates the example behind one browser-facing origin rather than requiring the frontend to track a separately auto-selected backend port.

Sources: [Vite configuration](https://github.com/livestorejs/livestore/blob/v0.4.0/examples/web-todomvc-sync-cf/vite.config.ts), [worker and sync URL](https://github.com/livestorejs/livestore/blob/v0.4.0/examples/web-todomvc-sync-cf/src/livestore.worker.ts).

This is an example topology, not a promise that LiveStore starts arbitrary Nx apps, repairs package installations, or handles QRK's Next/Vite split. QRK's stopped studio, duplicate nested dependency installation, and API/Zerospin port collision are workspace/startup issues. The nested dependency installation was introduced during this chat and then relinked to the root workspace.

## Implication for Zerospin

The reusable design lessons are to make worker asset ownership explicit at the bundler boundary, own a runtime-specific SQLite loader with a compatible JavaScript entry, and establish one deliberate endpoint contract for local startup. These address different failures. More Next rewrites cannot repair a backend SQLite loader, and changing a SQLite import cannot repair an HTML response at a worker URL. Any change to Zerospin's fixed worker URL must also preserve its intended worker-sharing identity across tabs and builds.
