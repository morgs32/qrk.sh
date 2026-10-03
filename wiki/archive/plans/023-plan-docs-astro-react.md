# Docs Astro and React migration

## Agreed scope

Replace the docs VitePress application with an Astro static site and React
interactive components. Bring the relevant VoidZero theme source into docs/src.
Keep the copied Vite+ homepage, guide content, URLs, branding, assets and external
links. Remove the old Vue/VitePress app and dependencies outright.

## Implementation and verification

1. Copy the relevant theme styles, fonts and assets with provenance.
2. Port static homepage sections and layouts to Astro, interactions to React,
   and guide content to Markdown/MDX with native callouts and details.
3. Preserve responsive navigation, search, dark mode, code groups, prompt and
   command copying, terminal demos, Rive animations, Mermaid and LLM text routes.
4. Update the Nx targets, dependencies, lockfile and docs README.
5. Run scoped typecheck, lint and build. Inspect desktop/mobile routes and
   interactions, check generated links/assets and remove superseded source.
6. Reconcile docs; no new domain terminology or qualifying ADR is expected.

## Outcome

Completed on 2026-09-30. Astro builds the homepage, 31 guide pages, a 404 page,
search JSON and both LLM text endpoints. Static sections use Astro; interactive
controls use React. The app owns the relevant theme CSS, fonts and assets, with
upstream licensing provenance in `docs/src/theme/NOTICE.md`. Vue, VitePress and
the theme package dependency were removed. Existing domain terminology remains
unchanged; this migration requires no glossary entry or governing ADR.

## Verification

1. `pnpm nx test @zerospin/docs` passed, including its typecheck and build
   dependencies. All three site tests passed: guide coverage, internal links and
   fragments/assets, and search/LLM coverage.
2. `pnpm nx lint @zerospin/docs` passed with zero errors and warnings. Scoped
   oxfmt checking and `git diff --check` passed.
3. Chrome desktop and 390px mobile checks covered the homepage and guide,
   navigation, dark mode, prompt dialog, search, code tabs, clipboard feedback,
   deep links into collapsed details, Mermaid and Rive rendering. No runtime
   errors were observed. The temporary viewport override was reset.
4. Frozen installation passed. All non-docs lockfile importers retain their
   original resolutions. Existing unrelated working-tree changes were preserved.
5. Nx Cloud reports access code 401 after successful local checks. Vite emits
   a large-chunk advisory for the dynamically imported Mermaid bundle; diagrams
   load only on guide pages that contain them.

## Remaining work

None.
