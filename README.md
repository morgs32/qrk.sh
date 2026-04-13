# qrk.sh

Next.js app with App Router.

## Features

- Homepage tile grid and catalog (see **Homepage tile catalog identity** below)

## Homepage tile catalog identity

The grid / tile drawer catalog is defined under `components/home/tiles/`. These rules are **invariants** for every collection and variant:

1. **`collectionName`** — kebab-case id for the collection; **each collection has a distinct `collectionName`** in the catalog.
2. **`def.name`** (on each tile variant) — kebab-case slug **unique within that collection** (e.g. `2x2`, `4x4`, `8x2` among siblings).
3. **Globally**, **`(collectionName, def.name)`** uniquely identifies a catalog tile variant. Do not rely on a single concatenated string for that pair in the drawer UI: [TilePreview](components/home/TilePreview.tsx) sets **`data-tile-drawer-collection-name`** and **`data-tile-drawer-tile-name`** separately.

More detail and test patterns: [docs/styleguide/component-and-file-naming.md](docs/styleguide/component-and-file-naming.md) (section **Tile variant identity**).

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

2. Start the development server:

   ```bash
   pnpm dev
   ```

3. Open http://localhost:3000

### Production server

After `pnpm build`, `pnpm start` runs the production server on **port 5000** (http://localhost:5000).

## Deployment

Deploy on Vercel or any host that supports Next.js: build with `pnpm build`, run `pnpm start` (or the platform’s Next preset).
