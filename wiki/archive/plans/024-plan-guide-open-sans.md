# Open Sans on guide pages

**Date:** 2026-09-30

**Status:** Complete.

## Scope and decision

1. Use Open Sans for everything inside `/guide/` pages: sidebar, article headings and prose, inline and fenced code, page outline, pager, and controls inserted into the guide content. Keep the shared site header in its current Space Mono styling.
2. Scope the change to the guide route's `.docs-shell`. The header is rendered outside that element by `Page.astro`; other routes also use `docs-layout`, so changing that body class or global font tokens would affect pages outside `/guide/`.
3. Bundle Open Sans locally through Fontsource, following the existing Space Mono setup. Include the regular, semibold, bold, and italic faces used by guide content. Do not load a remote font at runtime.

## Implementation

1. Add `@fontsource/open-sans` to `docs/package.json` and make only the corresponding dependency changes in `pnpm-lock.yaml`.
2. Add a guide-specific stylesheet imported by `docs/src/pages/guide/[...id].astro`. In `.docs-shell`, set Open Sans as the inherited font and override the local `--font-sans`, `--font-heading`, `--font-mono`, `--vp-font-family-base`, and `--vp-font-family-mono` values. These cover Tailwind font utilities and VitePress prose and code styles without changing the header's inherited tokens.
3. Inspect guide-specific selectors for any explicit font family that bypasses those values. Add a narrow `.docs-shell` override only where necessary; leave `site.css`, global tokens, and non-guide pages in Space Mono.

## Verification and closeout

1. In the browser, check `/guide/` and `/guide/global-cli` at desktop and mobile widths. Confirm computed Open Sans on the sidebar, heading, body text, inline code, fenced code, outline, pager, and copy controls; confirm Space Mono in the shared header and on the home page.
2. Run the docs lint, typecheck, and build targets through `pnpm nx`, then check the scoped diff and lockfile for unrelated changes.
3. Reconcile documentation after implementation. No glossary term or ADR is expected for this typography change; add one only if the implemented result introduces a qualifying domain term or architectural decision. Archive this plan when implementation and verification are complete.

## Remaining work

None.

## Outcome

- Added locally bundled Open Sans faces and scoped the guide font tokens to `.docs-shell`. No extra selector overrides were needed.
- Verified computed fonts on `/guide/` and `/guide/global-cli` at desktop and 390px mobile widths: sidebar, headings, prose, inline and fenced code, outline, pager, and controls use Open Sans. The shared header and home page retain Space Mono.
- Docs lint, typecheck, and build passed through `pnpm nx`. A frozen offline lockfile check passed, and the lockfile diff against its pre-implementation worktree state contains only the Open Sans dependency entries.
