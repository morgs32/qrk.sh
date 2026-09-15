# qrk.sh

Two Next.js apps with App Router:

- `apps/web` owns the public homepage at `/` and the `/sign-in`, `/sign-up`, and `/replace` routes.
- `apps/studio` owns dashboards at `/:username`, published sites, and site workspaces under `/:username/site`.

## Features

- Brick grid and groups (see **Brick group identity** below)

## Brick group identity

Brick groups are defined under `apps/bricks/groups/`.

1. **`groupName`** identifies a group; **`catalog`** identifies a data/configuration and responsive presentation definition within it.
2. **`(groupName, catalog)`** uniquely identifies a group brick, independently of dimensions. Views are no longer a separate selection.
3. Placed bricks retain their own **`brickId`**. Workbench bricks and backend brick records store **`groupId`** and **`catalogId`**.

This is a hard terminology cutover: old backend state must be reset before reuse.
Model and contract versions remain unchanged. Browser persistence version 2 resets
older sandbox bricks and site editor drafts on hydration. Storage keys remain
`qrk-bricks-sandbox-responsive-bricks-v2` and `qrk-site-editor-drafts-v2`.

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
pnpm nx run @qrk.sh/studio:dev
```

### Production server

Build and start either app with its package name: `@qrk.sh/web` for the homepage or `@qrk.sh/studio` for the dashboard and site app.

## Deployment

Deploy both Next.js apps and route `/`, `/sign-in(.*)`, `/sign-up(.*)`, and `/replace` to `@qrk.sh/web`; route the remaining application paths to `@qrk.sh/studio`.
