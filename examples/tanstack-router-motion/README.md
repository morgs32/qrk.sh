# TanStack Router + Motion

The committed baseline used the keyed `Outlet` approach from [TanStack's Framer Motion example](https://github.com/TanStack/router/blob/main/examples/react/with-framer-motion/src/main.tsx), adapted to catalog/detail drawers. It is not a verbatim copy.

Run from the repository root:

```sh
pnpm nx run @qrk.sh/tanstack-router-motion:dev
```

Open http://127.0.0.1:4317. Build with `pnpm nx run @qrk.sh/tanstack-router-motion:build`.

## What to inspect

1. Open catalog, then brick detail. The left shell stays mounted.
2. Navigate home. The outgoing drawer retains its content during the 300 ms exit.
3. Use Back/Forward and switch to compose.
4. Edit the draft input and scroll the grid; both remain mounted across navigation.
5. Inspect `window.events` for shell mount/unmount events.

## Persistent-owner fix

`Drawers` reads public route matches and passes concrete children to `Shell`. `AnimatePresence` directly owns shells keyed by side, retaining their last children during exit. Catalog and detail share the left shell; switching sides allows the outgoing and incoming shells to coexist.

Routes now define matching structure; the persistent owner renders drawer content. `Shell` accepts children instead of reading a live `Outlet`. No router-context cloning or private APIs are used.

Real application content that reads route params directly would still need those values passed into the exiting view rather than reading the new route during exit.

Dependencies match the isolated experiment. This example uses JSX to focus the diff on rendering behavior.
