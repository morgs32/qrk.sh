# API

The API Worker mounts the Bricks RPC target at <https://api.qrk.localhost/>.
It also serves `/upload`, `/image/upload`, and `/assets/*`.

## Development

```sh
pnpm --filter @qrk.sh/api dev
```

## Portless

```sh
portless get api.qrk
```

## Build

```sh
pnpm --filter @qrk.sh/api build
```

## Types

```sh
pnpm --filter @qrk.sh/api types
```
