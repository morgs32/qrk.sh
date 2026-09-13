# TanStack Router + Motion baseline

This is the initial experiment, before the persistent-owner fix. It follows the keyed `Outlet` approach from [TanStack's Framer Motion example](https://github.com/TanStack/router/blob/main/examples/react/with-framer-motion/src/main.tsx), adapted to catalog/detail drawers. It is not a verbatim copy.

Run from the repository root:

```sh
pnpm nx run @qrk.sh/tanstack-router-motion:dev
```

Open http://127.0.0.1:4317. Build with `pnpm nx run @qrk.sh/tanstack-router-motion:build`.

## What to inspect

1. Open catalog, then brick detail. The left shell stays mounted.
2. Navigate home. The intended 300 ms exit does not run: the live outlet follows the new route and removes its old content immediately.
3. Use Back/Forward and switch to compose.
4. Edit the draft input and scroll the grid; both remain mounted across navigation.
5. Inspect `window.events` for shell mount/unmount events.

`AnimatedOutlet` uses `AnimatePresence mode="wait"` around an outlet keyed by the next match. `Shell` contains another live outlet. Changing the presence mode to `sync` reproduced duplicate incoming drawers in the initial experiment.

The known animation defect is intentional in this baseline. Commit this version before applying the persistent Motion owner change, so that change is reviewable as a separate diff. No router-context cloning or private API usage is included.

Dependencies match the versions used in the isolated experiment. This example uses JSX to keep the baseline focused on rendering behavior.
