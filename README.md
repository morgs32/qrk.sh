# qrk.sh

Next.js app with App Router.

## Features

- Homepage brick grid and catalog (see **Homepage brick catalog identity** below)

## Homepage brick catalog identity

The grid / brick drawer catalog is defined under `components/home/bricks/`. These rules are **invariants** for every collection and variant:

1. **`collectionName`** — kebab-case id for the collection; **each collection has a distinct `collectionName`** in the catalog.
2. **`def.name`** (on each brick variant) — kebab-case slug **unique within that collection** (e.g. `2x2`, `4x4`, `8x2` among siblings).
3. **Globally**, **`(collectionName, def.name)`** uniquely identifies a catalog brick variant. Do not rely on a single concatenated string for that pair in the drawer UI: [BrickPreview](app/(site)/site/[siteId]/page/[pageId]/BrickCatalogPreview/BrickPreview.tsx) sets **`data-brick-drawer-collection-name`** and **`data-brick-drawer-brick-name`** separately.

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

2. Start the development server:

   ```bash
   pnpm dev
   ```

3. Open http://localhost:4000

### Production server

After `pnpm build`, `pnpm start` runs the production server on **port 4000** (http://localhost:4000).

## Deployment

Deploy on Vercel or any host that supports Next.js: build with `pnpm build`, run `pnpm start` (or the platform’s Next preset).
