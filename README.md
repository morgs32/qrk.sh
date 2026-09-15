# qrk.sh

Two Next.js apps with App Router:

- `apps/web` owns the public homepage at `/` and the `/sign-in`, `/sign-up`, and `/replace` routes.
- `apps/app` owns dashboards at `/:username`, published sites, and site workspaces under `/:username/site`.

## Features

- Brick grid and catalog (see **Brick catalog identity** below)

## Brick catalog identity

The grid / brick drawer catalog is defined under `packages/bricks/src/catalogs/`.

1. **`catalogName`** identifies a catalog; **`registry`** identifies a data/configuration and responsive presentation definition within it.
2. **`(catalogName, registry)`** uniquely identifies a catalog brick, independently of dimensions. Views are no longer a separate selection.
3. Placed bricks retain their own **`brickId`**. Workbench bricks store **`catalogId`** and **`registryId`**. Existing backend command/model versions retain their historical schema.

This is a hard terminology cutover: old backend state requires an explicitly authorized reset before reuse. Model and contract versions remain unchanged. Old browser storage is ignored and left untouched; the sandbox uses `qrk-bricks-sandbox-responsive-bricks-v2`, and editor drafts use `qrk-site-editor-drafts-v2`.

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

To run the dashboard and site app instead:

```bash
pnpm nx run @qrk.sh/app:dev
```

### Production server

Build and start either app with its package name: `@qrk.sh/web` for the homepage or `@qrk.sh/app` for the dashboard and site app.

## Deployment

Deploy both Next.js apps and route `/`, `/sign-in(.*)`, `/sign-up(.*)`, and `/replace` to `@qrk.sh/web`; route the remaining application paths to `@qrk.sh/app`.
