# Dashboard and editor

React Router 8.3.1 Data Mode SPA with Vite. The marketing and authentication app in `apps/web` remains on Next.js.

## Local commands

Run from the repository root:

```sh
pnpm nx run @qrk.sh/studio:dev
pnpm nx run @qrk.sh/studio:build
pnpm nx run @qrk.sh/studio:typecheck
pnpm nx run @qrk.sh/studio:lint
pnpm nx run @qrk.sh/studio:start
pnpm nx run @qrk.sh/studio:storybook
pnpm nx run @qrk.sh/studio:build-storybook
pnpm nx run @qrk.sh/studio:test:e2e -- --project=chromium
```

Development retains the shared-library, web, and Zerospin Nx dependencies. Web listens on port 3000 and proxies app requests to `APP_ORIGIN` (default `http://localhost:3001`). Vite listens on 3001. Client route URLs are rooted at `/`; Vite modules, fonts, and compiled assets use `/assets/`; HMR uses `/assets/hmr` so the WebSocket upgrade avoids Next’s trailing-slash normalization. The backup worker's existing `/__zerospin/` URLs are forwarded to the app's public assets.

`build` writes `build/client`. `start` serves that directory on port 3001 (`PORT` overrides it), serves assets with their normal MIME types, returns 404 for missing SPA assets, and falls back to `index.html` for client routes. A production host must provide that same fallback and forward `/assets/` and `/__zerospin/` assets; production hosting and deployment are not configured here.

## Environment

Place local values in `apps/studio/.env.local`. Only these public variables are compiled into client code:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_ZEROSPIN_API_URL`
- `NEXT_PUBLIC_ZEROSPIN_PUBLISHABLE_KEY`
- `PUBLIC_MAPBOX_TOKEN`

Required-value checks remain at app initialization and Vite configuration. Clerk secret keys belong to web/backend configuration and are never injected by Vite. Sign-in and sign-up use web routes and retain `/replace` as the fallback destination. Web performs signed-out redirects; the app retains its client guard and Zerospin retains backend authorization.

## Routes and state

`app/main.tsx` mounts `RouterProvider`; `app/routes.ts` declares explicit data routes with lazy component imports and route handles. Site/page draft initialization, `MainColumns`, and grid state stay in persistent layouts. Pathless drawer layouts own the left, right, and bottom shells. `Drawers` captures `useOutlet()` under a drawer-group key, including the base-page outlet. Leaf handles supply the toolbar element to its separate persistent Motion boundary. This preserves same-group shell identity and outgoing parameter context without private router APIs. Drawer transitions last 300 ms and respect reduced motion.

## Browser tests

Playwright builds and starts the static preview on port 3333. Authenticated editor tests require `PLAYWRIGHT_STORAGE_STATE` pointing to a valid Clerk browser storage-state file and a running local Zerospin backend. Generate that file with Clerk’s [authenticated Playwright setup](https://clerk.com/docs/guides/development/testing/playwright/test-authenticated-flows): call `clerkSetup()`, authenticate a development user with `clerk.signIn({ page, emailAddress })`, verify access to the editor, then save `page.context().storageState({ path })`. Keep the session file outside version control. They do not bypass application authorization. `PLAYWRIGHT_EDITOR_PATH` can identify an existing site/page; the default test path is `/e2e/site/e2e/page/home`.

The standalone routing acceptance gate is:

```sh
pnpm nx run @qrk.sh/react-router-motion:test:e2e:cold -- --project=chromium
pnpm nx run @qrk.sh/react-router-motion:test:e2e
```

The cold target forces Vite dependency optimization. It verifies retained outgoing parameters, shell identity, history, interrupted navigation, and persistent grid input/scroll independently of authentication.

To run focused smoke tests against an already running app dev server:

```sh
PLAYWRIGHT_EXTERNAL_SERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3001 pnpm nx run @qrk.sh/studio:test:e2e -- tests/spa.playwright.spec.ts
```

For authenticated tests through web, use `PLAYWRIGHT_BASE_URL=http://localhost:3000` with `PLAYWRIGHT_EXTERNAL_SERVER=1`, `PLAYWRIGHT_STORAGE_STATE`, and `PLAYWRIGHT_EDITOR_PATH`. Run `Drawers.playwright.spec.ts` with `--workers=1` when sharing one empty test page across browser projects. Cross-drawer assertions use keyboard activation where the existing drawer geometry covers toolbar links. The older brick group tests assume a populated group; the current group is empty and those expectations are outside this migration.
