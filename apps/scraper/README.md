# Scraper

Cloudflare Worker that scrapes Linktree profiles through Cap'n Web RPC.
Owns the Worker name `scraper`, `BrowserHost`, and `LinktreeRepo`.

```sh
pnpm nx run @qrk.sh/scraper:tsc
pnpm nx run @qrk.sh/scraper:test:workerd
pnpm nx run @qrk.sh/scraper:test:live
```

`test:live` is opt-in and reads `SCRAPER_LIVE_LINKTREE_URL` from `.env.local`.
