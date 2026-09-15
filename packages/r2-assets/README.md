# `@qrk.sh/r2-assets`

Serve objects from an R2 binding at `GET /assets/*`, and build public object URLs that work in local Miniflare (path-absolute base) or production (absolute `pub-….r2.dev` host).

**Library drop-in:** add an `r2_buckets` binding and `R2_PUBLIC_BASE_URL: "/assets"`, call `tryHandleR2Asset` early in the Worker `fetch` handler, and add `/assets/*` to `assets.run_worker_first` so SPA static assets do not swallow the route.
