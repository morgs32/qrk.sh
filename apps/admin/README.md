# Admin

Admin displays QRK's system diagrams at <https://admin.qrk.localhost/>.

| Page            | Metadata                  | Browser session |
| --------------- | ------------------------- | --------------- |
| System diagrams | `@qrk.sh/zerospin/system` | None            |

## Development

Start all local apps with `pnpm dev` from the workspace root, or start Admin alone:

```sh
pnpm nx run @qrk.sh/admin:dev
```

Vite listens on loopback using `PORT` or `10002`. Portless proxies `admin.qrk` to
<https://admin.qrk.localhost/>.

## Portless

```sh
portless get admin.qrk
```

## Build

```sh
pnpm nx run @qrk.sh/admin:build
```

## Preview

```sh
pnpm nx run @qrk.sh/admin:preview
```

Serves the Vite preview on loopback using `PORT` or `10012`.

## System metadata

The Node-side Vite configuration imports QRK's existing system declaration and
calls `sdk.makeSystemSpec({ system })`. Vite embeds only the serialized metadata in
the browser application. The browser renders `SystemDiagrams` with that metadata
and the package stylesheet; it does not import the executable system declaration
or open a Zerospin session.

The metadata is a snapshot taken at development startup or build time. Restart
Admin after changing system declarations, or rebuild the preview. Loading or
projecting the declaration must succeed before Vite can start or build.

This app is for local development and has no authentication or deployment setup.
