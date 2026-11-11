# Web

Web serves the site at <https://qrk.localhost/>.

## Wall viewer

The **Web / WallViewer / Published Snapshot** Storybook fixture renders an
ordered Wall from snapshot data. **Portfolio Snapshot** renders Behance and
Buy Me a Coffee through their module views using V5 snapshot data.
`WallViewer` takes a breakpoint, the Site's
Brick gap, and a callback that renders each saved Brick and Placement. It
produces HTML using the saved Row sizing and alignment. The fixture supplies
static Brick content. Public page routing and snapshot retrieval are separate
from this fixture.

## Development

```sh
pnpm --filter @qrk.sh/web dev
```

## Portless

```sh
portless get qrk
```

## Build

```sh
pnpm --filter @qrk.sh/web build
```

## Start

```sh
pnpm --filter @qrk.sh/web start
```

Serves Next on `PORT` or `10011`.
