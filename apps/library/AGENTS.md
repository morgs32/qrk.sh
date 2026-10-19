# Library

Library's standalone UI uses TanStack Start in SPA mode. File routes live in
`routes/`; `router.tsx` registers their generated tree. `vite.config.ts` owns
development configuration. Storybook has its own Vite configuration and does
not load the Start server plugin. Library has no production build or preview
target; consumers compile its source exports directly.

The standalone initializer, wall, and viewport owners remain above the route
outlet so child navigation retains their session and state.

Follow the repository root instructions and the [Library README](./README.md).
