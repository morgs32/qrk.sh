# App

App serves the editor at <https://app.qrk.localhost/>.

| Area | Worker                     | Pure manifest           |
| ---- | -------------------------- | ----------------------- |
| User | `zerospin/node.worker.ts`  | `userSessionDefinition` |

## Development

```sh
pnpm --filter @qrk.sh/app dev
```

## Portless

```sh
portless get app.qrk
```

## Build

```sh
pnpm --filter @qrk.sh/app build
```

## Preview

```sh
pnpm --filter @qrk.sh/app preview
```

Serves the Vite preview on `PORT` or `10010`.
