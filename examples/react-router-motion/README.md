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

The Nx build and frozen dependency installation pass. The Chrome acceptance sequence passes against both the production preview and the warmed development server:

1. Catalog to detail preserves shell DOM identity.
2. Closing retains `Brick one` during exit, then removes the drawer.
3. Back/Forward retain outgoing shells and restore the expected content.
4. Switching sides preserves old content while the new drawer enters.
5. Rapid navigation settles with one correct drawer.
6. Draft input and grid scroll survive without uncaught browser errors.

The first dev run encountered a dynamic-import error during dependency optimization; another dev run failed the rapid-navigation removal check. The production run and subsequent warmed dev run passed. These observations do not establish reliability for all cold development navigations.

This test has synchronous route content. Data loaders, actions, Suspense, other browsers, and the full QRK editor are not covered. Inspect `window.events` for shell mount/unmount events.

## References

1. [Framework route configuration](https://reactrouter.com/start/framework/routing)
2. [SPA output](https://reactrouter.com/how-to/spa)
3. [useOutlet](https://api.reactrouter.com/v8/functions/react-router.useOutlet.html)
