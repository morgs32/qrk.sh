# Kitesurf brick measurement

Standalone React + Cloudflare Worker example that renders the library’s GitHub profile brick with fixed data and compares local browser dimensions against [Cloudflare Browser Rendering `/scrape`](https://developers.cloudflare.com/browser-run/quick-actions/scrape-endpoint/) with `?browser=kitesurf`.

## What it does

1. `/render?breakpoint=sm|md|lg|xl` — brick only, inside a `qrk-bricks` wrapper with `width/height: max-content`. Sets `data-measure-ready="ok"` after React commit, `document.fonts.ready`, and avatar decode (or `"failed"` with an explicit error).
2. `/` — breakpoint selector, iframe of `/render`, local pixel + grid-unit readout, and a **Measure with Kitesurf** button.
3. `POST /measure` — Worker calls `…/browser-rendering/scrape?browser=kitesurf` against the configured public `/render` URL and returns rounded `widthPx` / `heightPx`.

Grid units match the library convention: round pixels, then `max(1, ceil(px / gridItemWidth))`.

## Setup

```bash
pnpm install
```

Fill `wrangler.jsonc` vars:

| Var | Purpose |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Account id in the scrape URL |
| `PUBLIC_EXAMPLE_ORIGIN` | Public origin Kitesurf navigates to (no trailing slash), e.g. `https://kitesurf-measure.<subdomain>.workers.dev` |

Set the Browser Rendering API token as a secret (token needs **Browser Rendering — Edit**):

```bash
pnpm --filter @qrk.sh/kitesurf-measure exec wrangler secret put BROWSER_RENDERING_API_TOKEN
```

For local `vite` / `wrangler dev`, put the same values in `examples/kitesurf-measure/.dev.vars`:

```
BROWSER_RENDERING_API_TOKEN=…
```

(`CLOUDFLARE_ACCOUNT_ID` and `PUBLIC_EXAMPLE_ORIGIN` can live in `wrangler.jsonc` vars for local too.)

Local `/measure` still scrapes **`PUBLIC_EXAMPLE_ORIGIN`**, not localhost — deploy first (or point the origin at an already-deployed preview).

## Commands

```bash
pnpm nx run @qrk.sh/kitesurf-measure:dev
pnpm nx run @qrk.sh/kitesurf-measure:build
pnpm nx run @qrk.sh/kitesurf-measure:typecheck
pnpm nx run @qrk.sh/kitesurf-measure:lint
pnpm nx run @qrk.sh/kitesurf-measure:deploy
```

## Manual checks

1. Open `/` and `/render` at each breakpoint; confirm Fragment Mono + bundled avatar, and `data-measure-ready="ok"`.
2. Confirm local width/height and grid units update per breakpoint.
3. Click **Measure with Kitesurf**; record pixel Δ and whether grid units agree. Disagreement is an experiment result — leave it visible.
4. Clear the token or account id and confirm the UI shows a clear credential / API error.

## Observed compatibility

_Fill in after a live Kitesurf run:_

| Breakpoint | Local px (w×h) | Kitesurf px (w×h) | Δ px | Grid agree? |
| --- | --- | --- | --- | --- |
| sm | | | | |
| md | | | | |
| lg | | | | |
| xl | | | | |

Notes:

-
