# Scraper

Cloudflare Worker that scrapes Linktree profiles through Cap'n Web RPC.
Owns the Worker name `scraper`, `BrowserHost`, and `LinktreeRepo`.

```sh
pnpm nx run @qrk.sh/scraper:types
```

`types` regenerates Worker bindings. Repository tests and standalone automated
checks are deferred until a test structure is agreed (see root `AGENTS.md`).
