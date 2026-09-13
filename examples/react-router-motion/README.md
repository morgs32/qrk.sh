# React Router Framework + Motion grouped layouts

React Router 8.3.1 Framework mode with SPA output (`ssr: false`), React 19.3.0, and Motion 13.2.0. This replaces the earlier declarative version of this example; the TanStack example remains separate.

## Run

From the repository root:

```sh
pnpm nx run @qrk.sh/react-router-motion:dev
```

Open http://127.0.0.1:4319.

```sh
pnpm nx run @qrk.sh/react-router-motion:build
pnpm nx run @qrk.sh/react-router-motion:preview -- --port 4320
```

The build generates `build/client/index.html` for static SPA hosting. Deep links must fall back to that file.

## Route declarations and animation ownership

1. `src/routes.ts` declares route modules using `index`, `route`, and pathless `layout` helpers.
2. `LeftDrawerLayout` wraps catalog and brick detail in a shared `Shell` with an `Outlet`. `RightDrawerLayout` wraps compose. Their exported handles identify the animation group.
3. The root renders a persistent `Workspace` containing navigation, a draft input, and a scrollable grid.
4. `Workspace` reads the framework matches and captures `useOutlet()` as an element. `AnimatePresence` retains that element under its layout-group key through exit; it does not mount a fresh live Outlet at the presence boundary.
5. Catalog and detail share the left group key, preserving the shell. Different groups animate simultaneously. `BrickDetail` reads the retained route's params with `useParams()`.

No manual route table in Workspace, central content switch, router-context cloning, or private router APIs are used. `root.jsx` provides the HTML document and hydration fallback; Framework mode owns client bootstrapping and route code splitting.

## Verification

Run the checked-in acceptance tests through Nx:

```sh
pnpm nx run @qrk.sh/react-router-motion:test:e2e:cold -- --project=chromium
pnpm nx run @qrk.sh/react-router-motion:test:e2e
pnpm nx run @qrk.sh/react-router-motion:test:e2e:preview
```

The cold target forces dependency optimization on a fresh dev-server startup. The original cold failure was reproduced: Vite returned `504 Outdated Optimize Dep` for `react-dom/client` and `react-router/dom` while hydrating. Including the hydration entry and Motion in `optimizeDeps.include` prevents late discovery in the tested sequence.

The tests verify same-group shell identity, retained outgoing brick parameters, close/reopen, Back/Forward, interrupted rapid navigation, and persistent input/scroll. Chromium cold and warm runs and Firefox/WebKit development runs pass. Rapid navigation has not reproduced a stranded drawer in these checked-in runs; the test waits for each URL commit before interrupting the animation, then asserts final drawer count and content.

This example has synchronous route content. It does not prove the authenticated QRK editor's behavior. Inspect `window.events` for shell mount/unmount events.

## References

1. [Framework route configuration](https://reactrouter.com/start/framework/routing)
2. [SPA output](https://reactrouter.com/how-to/spa)
3. [useOutlet](https://api.reactrouter.com/v8/functions/react-router.useOutlet.html)
