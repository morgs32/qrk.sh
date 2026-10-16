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
5. Catalog and detail share the left group key, preserving the shell. Different groups animate simultaneously. `BrickDetail` reads the retained route's params from its generated `Route.ComponentProps`.

No manual route table in Workspace, central content switch, router-context cloning, or private router APIs are used. `root.jsx` provides the HTML document and hydration fallback; Framework mode owns client bootstrapping and route code splitting.

## Route IntelliSense

The source `tsconfig.json` includes JSX and React Router's generated types. The dev server refreshes these types as routes change. To generate them without starting the server:

```sh
pnpm nx run @qrk.sh/react-router-motion:typegen
```

`BrickDetail.jsx` uses JSDoc `import("./+types/BrickDetail").Route.ComponentProps` so `props.params.brickId` is a known string. JSX route modules can use the same annotation with their own generated filename. TypeScript route modules can use `import type { Route } from "./+types/ModuleName"` and annotate props with `Route.ComponentProps`.

For loaders, annotate arguments with `Route.LoaderArgs` or `Route.ClientLoaderArgs` and leave the return type inferred. React Router then derives `Route.ComponentProps.loaderData` from the loader's return value. This SPA example currently has no loaders; use `clientLoader` for browser-side loading. Generated files stay ignored by Git.

## Verification

Repository tests and standalone automated checks are deferred until a test
structure is agreed (see root `AGENTS.md`). For manual review, inspect
`window.events` for shell mount/unmount events and use the running example to
review drawer navigation, input, and scroll persistence.

## References

1. [Framework route configuration](https://reactrouter.com/start/framework/routing)
2. [SPA output](https://reactrouter.com/how-to/spa)
3. [useOutlet](https://api.reactrouter.com/v8/functions/react-router.useOutlet.html)
