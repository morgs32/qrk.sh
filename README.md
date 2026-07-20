# qrk.sh

Two Next.js apps with App Router:

- `apps/web` owns the public homepage at `/` and the `/sign-in`, `/sign-up`, and `/replace` routes.
- `apps/app` owns dashboards at `/:username`, published sites, and site workspaces under `/:username/site`.

## Features

- Brick grid and catalog (see **Brick catalog identity** below)

## Brick catalog identity

The grid / brick drawer catalog is defined under `packages/bricks/src/collections/`. These rules are **invariants** for every collection and variant:

1. **`collectionName`** — kebab-case id for the collection; **each collection has a distinct `collectionName`** in the catalog.
2. **`def.name`** (on each brick variant) — kebab-case slug **unique within that collection** (e.g. `2x2`, `4x4`, `8x2` among siblings).
3. **Globally**, **`(collectionName, def.name)`** uniquely identifies a catalog brick variant. Do not rely on a single concatenated string for that pair in the drawer UI: [BrickPreview](apps/app/app/[username]/site/[siteId]/page/[pageId]/BrickCarousel/BrickPreview.tsx) sets **`data-brick-drawer-collection-name`** and **`data-brick-drawer-brick-name`** separately.

More detail and test patterns: [docs/styleguide/component-and-file-naming.md](docs/styleguide/component-and-file-naming.md) (section **Brick variant identity**).

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

To run the dashboard and site app instead:

```bash
pnpm nx run @qrk.sh/app:dev
```

### Production server

Build and start either app with its package name: `@qrk.sh/web` for the homepage or `@qrk.sh/app` for the dashboard and site app.

## Deployment

Deploy both Next.js apps and route `/`, `/sign-in(.*)`, `/sign-up(.*)`, and `/replace` to `@qrk.sh/web`; route the remaining application paths to `@qrk.sh/app`.
