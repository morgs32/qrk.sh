# qrk.sh

## Vendor

Configured vendor origins are recorded here and in `AGENTS.md`:

| Prefix | Origin | Branch |
| --- | --- | --- |
| `vendor/zerospin` | `../zerospin` | `main` |

Use `$update-vendor` for squashed pulls from the sibling checkout.
The root pnpm workspace applies Zerospin's vendored sql.js patch so Cloudflare
Workers can initialize actor snapshot databases without `self.location`.

Two Next.js apps with App Router:

- `apps/web` owns the public homepage at `/` and the `/sign-in`, `/sign-up`, `/replace`, `/ordered-body`, and `/ordered-outline` routes.
- `apps/studio` owns dashboards at `/:username` and site workspaces under `/:username/site`.

## Features

- Brick grid and groups (see **Brick group identity** below)

## Brick group identity

Brick groups are defined under `apps/library/groups/`.

1. **`groupName`** identifies a group; **`catalog`** identifies a data/configuration and responsive presentation definition within it.
2. **`(groupName, catalog)`** uniquely identifies a group brick, independently of dimensions. Views are no longer a separate selection.
3. Placed bricks retain their own **`brickId`**. Library bricks and backend brick records store **`groupId`** and **`catalogId`**.

This is a hard terminology cutover: old backend state must be reset before reuse.
`libraryModule` exports the shared models and flat command contracts. Library and
Studio construct standalone sessions with their own identity and storage keys.

Model and contract versions remain unchanged. Library viewport preference
uses `qrk-bricks-library-viewport-v1`. Library and Studio walls are owned by
standalone sessions with IndexedDB backups, not persisted Zustand brick maps.

More detail and test patterns: [docs/styleguide/component-and-file-naming.md](docs/styleguide/component-and-file-naming.md).

## Tech Stack

- [Next.js 16.3.4](https://nextjs.org/) with App Router
- [React 19](https://react.dev/)
- [Tailwind 4](https://tailwindcss.com/) for styling
- [shadcn/ui](https://ui.shadcn.com/) for the design system

## Getting Started

### Prerequisites

- Node.js 20.9.0 or later
- pnpm (recommended) or npm/yarn

### Installation

1. Clone the repository and install dependencies:

   ```bash
   pnpm install
   ln -s ../../node_modules vendor/zerospin/node_modules
   ```

   Install dependencies from the QRK root. On a fresh checkout, the symlink
   lets vendored build scripts use the root toolchain. Avoid a separate install
   inside `vendor/zerospin`: duplicate dependency instances can cause actor-path
   validation to fail when `zerospin dev` loads the app configuration.

2. Start the homepage:

   ```bash
   pnpm nx run @qrk.sh/web:dev
   ```

3. Open http://localhost:3000

To run all app development servers and build their dependencies:

```bash
pnpm dev
```

Studio owns `apps/studio/zerospin/zerospin.worker.ts`, which calls
`makeSharedWorker({ sqliteWasmUrl })`. `userSession` supplies a lazy worker factory;
Zerospin chooses its name from the runtime version and persistent session identity.
Studio uses webpack in Next development and production builds to bundle the
worker and its `new URL(..., import.meta.url)` SQLite WASM asset. Studio listens
on port 3001 behind web on port 3000. Web proxies Studio's isolated
`/studio-static/_next/` asset namespace and its `/__zerospin/` backup-worker
artifacts. Existing `/assets/` public-file URLs have explicit Studio mappings.
Vite remains only for Studio Storybook.

Studio server-renders the document, fonts, and navigation before its browser
session initializes. The dashboard shows `qrk.sh`; the site navbar reserves its
custom wordmark with a skeleton. Browser-owned data and editor drafts stay under
the content readiness gate. Persistent App Router layouts retain the editor
across drawers; native React View Transitions animate drawer entry and snapshot
exit for 300 ms, with reduced-motion and immediate-navigation fallbacks.
See [Studio's README](apps/studio/README.md) for routes and browser checks.

The signed-in Clerk user supplies expected claims using the same `makeAggregateId`
construction as the server. Zerospin verifies those expectations online before
attachment. Offline reopening requires that exact previously verified identity
and session lock. Runtime versions use separate storage; pending commands in an
older version are not migrated or deleted.

The `api` Worker runs on port 8787 (inspector 9231) and Zerospin on port 8788. API
owns module RPCs, Clerk-authenticated uploads, and asset serving. See
[API's README](apps/api/README.md) for bindings and private provider settings. Set
`NEXT_PUBLIC_ZEROSPIN_API_URL=http://127.0.0.1:8788/` in `apps/studio/.env.local`.

To run only the library app and build its dependencies:

```bash
pnpm nx run @qrk.sh/library:dev
```

Library uses Next.js App Router with webpack on port 4100. Its Nx target starts
the unified API Worker on port 8787. Next forwards `/rpc`, `/upload`, and
`/assets/*` to API, preserving same-origin client URLs. Its reusable Vite library
build remains separate for Studio consumers and API's catalog registry.

To run the dashboard and site app instead:

```bash
pnpm nx run @qrk.sh/studio:dev
```

### Production server

Build and start either app with Nx: `pnpm nx run @qrk.sh/web:build` and
`pnpm nx run @qrk.sh/web:start`, or the equivalent `@qrk.sh/studio` targets.
Studio uses webpack and writes `.next`; its production server defaults to port
3001 (`PORT` overrides it). Keep web on port 3000 with `APP_ORIGIN` pointing to
Studio.

For Library, run `pnpm nx run @qrk.sh/library:build:app`, then
`pnpm nx run @qrk.sh/library:preview`. Preview serves `.next` on port 4100 and
starts the local API Worker. See [Library's README](apps/library/README.md)
for the backend-origin setting. API retains the existing R2 buckets; previously
saved absolute URLs using port 4101 need their origin updated separately.

## Deployment

Deploy both Next.js apps and route `/`, `/sign-in(.*)`, `/sign-up(.*)`, `/replace`, `/ordered-body`, and `/ordered-outline` to `@qrk.sh/web`; route the remaining application paths to `@qrk.sh/studio`.

Preserve the `/studio-static/`, `/assets/`, and `/__zerospin/` proxy routes in production.
