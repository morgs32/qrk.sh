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
- `apps/studio` owns dashboards at `/:username`, published sites, and site workspaces under `/:username/site`.

## Features

- Brick grid and groups (see **Brick group identity** below)

## Brick group identity

Brick groups are defined under `apps/library/groups/`.

1. **`groupName`** identifies a group; **`catalog`** identifies a data/configuration and responsive presentation definition within it.
2. **`(groupName, catalog)`** uniquely identifies a group brick, independently of dimensions. Views are no longer a separate selection.
3. Placed bricks retain their own **`brickId`**. Library bricks and backend brick records store **`groupId`** and **`catalogId`**.

This is a hard terminology cutover: old backend state must be reset before reuse.
Model and contract versions remain unchanged. Library viewport preference
uses `qrk-bricks-library-viewport-v1`. Site walls are owned by in-memory library
mock sessions (`wal_library`), not persisted Zustand brick maps.

More detail and test patterns: [docs/styleguide/component-and-file-naming.md](docs/styleguide/component-and-file-naming.md).

## Tech Stack

- [Next.js 15](https://nextjs.org/) with App Router
- [React 19](https://react.dev/)
- [Tailwind 4](https://tailwindcss.com/) for styling
- [shadcn/ui](https://ui.shadcn.com/) for the design system

## Getting Started

### Prerequisites

- Node.js 18.17.0 or later
- pnpm (recommended) or npm/yarn

### Installation

1. Clone the repository and install dependencies:

   ```bash
   pnpm install
   ```

2. Start the homepage:

   ```bash
   pnpm --filter @qrk.sh/web dev
   ```

3. Open http://localhost:4000

To run all app development servers and build their dependencies:

```bash
pnpm dev
```

Studio owns `apps/studio/zerospin/zerospin.worker.ts`, which calls
`makeSharedWorker({ sqliteWasmUrl })`. `userSession` supplies a lazy worker factory;
Zerospin chooses its name from the runtime version and persistent session identity.
Vite bundles the worker and SQLite WASM as ordinary `/assets/` resources, proxied
by web's general asset rewrite in development and production. No worker plugin
or worker-specific rewrite is needed. Studio normalizes empty development query
flags after Next proxies them so Vite recognizes `?url` and `?import` assets.
Standalone backup assets retain their
`/__zerospin/` to `/assets/__zerospin/` routing.

The signed-in Clerk user supplies expected claims using the same `makeAggregateId`
construction as the server. Zerospin verifies those expectations online before
attachment. Offline reopening requires that exact previously verified identity
and session lock. Runtime versions use separate storage; pending commands in an
older version are not migrated or deleted.

API runs on port 8787 and Zerospin on port 8788. Set
`NEXT_PUBLIC_ZEROSPIN_API_URL=http://127.0.0.1:8788/` in `apps/studio/.env.local`.

To run only the library app and build its dependencies:

```bash
pnpm nx run @qrk.sh/library:dev
```

To run the dashboard and site app instead:

```bash
pnpm nx run @qrk.sh/studio:dev
```

### Production server

Build and start either app with its package name: `@qrk.sh/web` for the homepage or `@qrk.sh/studio` for the dashboard and site app.

## Deployment

Deploy both Next.js apps and route `/`, `/sign-in(.*)`, `/sign-up(.*)`, `/replace`, `/ordered-body`, and `/ordered-outline` to `@qrk.sh/web`; route the remaining application paths to `@qrk.sh/studio`.
