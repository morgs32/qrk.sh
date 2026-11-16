# Web

Web serves the site at <https://qrk.localhost/>.

## Wall viewer

The **Web / WallViewer / Published Snapshot** Storybook fixture renders an
ordered Wall from snapshot data. **Portfolio Snapshot** renders Behance and
Buy Me a Coffee through their module views using the fresh V1 snapshot schema.
`WallViewer` takes a breakpoint, the Site's Brick gap, and a callback that
renders each saved Brick and Placement. It produces HTML using the saved Row
sizing and alignment. The fixture supplies static Brick content.

In local development, a published Site is available at
`https://<username>-<six-character-id>.qrk.localhost/`, with its published Page
paths after the host. The server resolves the saved hostname through Domains and
reads only the current published snapshot and public Site settings from the
canonical User release. Site or Page unpublication makes a new request
unavailable after the command commits.

Web's server requires `ZEROSPIN_API_URL` and `ZEROSPIN_SECRET_KEY` matching
the local Zerospin service in its own ignored
`.env.local`. Never use a `NEXT_PUBLIC_` prefix for this administrative key.
Map Bricks use the existing public `NEXT_PUBLIC_MAPBOX_TOKEN`. The local
wildcard Portless proxy must be running; see the root README. These settings do
not configure production.

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
