# Open-source bricks workbench implementation plan

**Date:** 2026-07-16
**Status:** Ready for implementation
**Design spec:** `.plans/archived/003-spec-open-source-bricks-workbench.md`

## Goal

Extract all eighteen catalog collections into a publishable `@qrk.sh/bricks` package, colocate a non-published TanStack Start development sandbox inside that package, and make the private Next.js application consume only the package's catalog API and CSS. Preserve existing brick identities, zero-prop component behavior, Brick persistence, and private editor interactions.

## Requirements Trace

1. Spec user stories 1 through 4 are implemented by the sandbox catalog, collection, and brick routes plus proportional size and canvas controls.
2. Spec user stories 5 and 7 are implemented by moving the complete catalog into `@qrk.sh/bricks` and migrating every private web import without changing persisted identity or behavior.
3. Spec user story 6 is implemented by Unpic, package-owned shadcn modules, a compiled package stylesheet, and a framework-neutral package build.

## Implementation Steps

1. Restore a usable Nx project graph before creating projects.
   1. Add a minimal `vendor/effect/project.json` naming the vendor root `effect-vendor-root`; leave the actual `vendor/effect/packages/effect` package named `effect` and do not reorganize vendor files.
   2. Verify `pnpm nx show projects --json` resolves the existing projects before relying on inferred package-script targets.
   3. Record the resolved target shape for `@qrk.sh/web`, `@qrk.sh/zerospin`, and `scraper`; preserve existing continuous development configuration.
2. Create the publishable `packages/bricks` library explicitly because the workspace has no suitable local or installed Nx library generator.
   1. Add a package manifest named `@qrk.sh/bricks`, mark it ESM, and expose only `.` and `./styles.css` through `exports`.
   2. Build the JavaScript and CSS with Vite library mode and emit declarations with TypeScript. Externalize React, React DOM, SWR, Unpic, Lucide, Radix Slot, class-variance-authority, clsx, and tailwind-merge and declare them in the appropriate dependency or peer-dependency section.
   3. Use React and React DOM as peer dependencies aligned with the repository's React 19 development versions. Keep runtime libraries used internally by bricks as package dependencies.
   4. Add `dev`, `build`, `build:workbench`, `typecheck`, `lint`, and `test:e2e` scripts so Nx infers the library and sandbox targets from this one package. Configure library output as `dist/index.js`, `dist/index.d.ts`, and `dist/styles.css`.
   5. Add a positive `files` allowlist containing `dist` and expose only `.` and `./styles.css`; do not publish `workbench`, tests, source, or development configuration.
   6. Add `@qrk.sh/bricks` as a `workspace:*` dependency of the private Next.js application through pnpm, then verify the workspace link resolves to `packages/bricks`.
3. Scaffold the TanStack Start development sandbox inside the package without creating a nested package.
   1. Run the official non-interactive TanStack scaffold with installation and Git initialization disabled in a disposable directory, inspect its generated versions and framework files, and copy only the Start entrypoints, route setup, and Vite configuration needed under `packages/bricks/workbench`.
   2. Do not retain the scaffold's `package.json`, lockfile, Git files, demo routes, or toolchain configuration; declare all sandbox dependencies once in `packages/bricks/package.json` using the exact scaffolded versions.
   3. Configure the package-root `dev` and `build:workbench` scripts to run TanStack Start against the sandbox Vite configuration and `workbench/src/routes` tree.
   4. Keep `packages/bricks/workbench` free of a nested package manifest so Nx and pnpm see one project and one dependency boundary.
4. Move the complete brick catalog without redesigning its domain model.
   1. Move `BrickFrame`, `types`, `makeBrick`, `makeCollection`, `collectionsHash`, `findCollectionBrick`, and every existing collection into package source while preserving component names, comments, collection names, brick names, dimensions, labels, order, and zero-prop `ComponentType` signatures.
   2. Convert internal aliases to package-relative imports. Keep one primary React component per PascalCase file and do not create collection or component subpath barrels.
   3. Add the approved package root entrypoint exporting only `collectionsHash`, `findCollectionBrick`, `IBrick`, `ICollection`, `ICollectionBrick`, and `ICollectionBrickDef`.
   4. Keep `makeBrick`, `makeCollection`, individual collections, individual components, `BrickFrame`, and package-owned shadcn modules internal to the package root API.
   5. Preserve `findCollectionBrick` behavior: resolve the exact `(collectionName, def.name)` pair and return `undefined` for an unknown identity without substituting a fallback.
5. Remove Next.js and private UI coupling from package-owned bricks.
   1. Replace the four `next/image` imports with `Image` from `@unpic/react`, preserving source URLs, alt text, fill behavior, object-fit behavior, responsive sizing, and the existing visible layout.
   2. Copy the current shadcn `Card`, `Button`, and `cn` implementations into package-internal modules, update GitHub card imports to those modules, and keep their supporting dependencies inside `@qrk.sh/bricks`.
   3. Preserve current GitHub SWR requests, hardcoded user behavior, loading states, error states, retry behavior, and zero-prop wrappers; do not introduce fixtures, providers, or data props.
   4. Confirm no package source imports `next/*`, `@/components/*`, `@/lib/*`, Clerk, Zerospin, React Grid Layout, or private application stores.
6. Make brick styling self-contained.
   1. Move only the theme tokens required by package bricks into the package stylesheet and scope defaults under a package-owned root marker so importing `styles.css` does not overwrite a host application's global theme.
   2. Compile the Tailwind utilities used by package source into `dist/styles.css`; consumers must not configure Tailwind source scanning for package files.
   3. Ensure `BrickFrame` and sandbox preview roots carry the package root marker so semantic shadcn tokens resolve in both light and dark modes.
   4. Keep the private web application's non-brick global CSS, React Grid Layout CSS, editor utilities, and unrelated theme ownership in `apps/web`.
7. Migrate the private Next.js application to the package boundary.
   1. Import `@qrk.sh/bricks/styles.css` once from the existing global application style entrypoint.
   2. Replace every import of moved catalog types, lookup functions, registry values, and collection definitions with the approved package root API; where the web app currently imports a specific collection only to obtain a default `def`, resolve that exact entry from `collectionsHash` without changing fallback selection.
   3. Remove the old app-owned bricks directory only after searches prove every consumer uses `@qrk.sh/bricks` and no private module still imports a moved file.
   4. Preserve Grid and Brick layout behavior, Zustand stores, drawer drag payloads, BrickCarousel, BrickPreview, BrickDetail, site routes, and component props unchanged except for their package imports and the separately approved Brick terminology migration.
8. Build the TanStack Start sandbox against the public package surface only.
   1. Import `@qrk.sh/bricks/styles.css` once in the root route and render all package content under the package theme root marker.
   2. Implement `/` by reading `collectionsHash` and rendering one explicit collection link for every catalog collection with its label and variant count.
   3. Implement `/collections/$collectionName` by exact registry lookup, rendering every brick variant at proportional dimensions, and linking each variant to `/bricks/$collectionName/$brickName`.
   4. Implement `/bricks/$collectionName/$brickName` by exact two-part lookup and render the component in a canvas sized as `def.w * gridUnitPx` by `def.h * gridUnitPx`.
   5. Add a labeled grid-unit range control with a default of 80 pixels and an allowed range of 40 through 160 pixels, plus a light/dark canvas toggle local to the page.
   6. Display collection name, brick name, label, width, and height next to the preview. Keep controls in the route module unless a second route actually reuses them.
   7. Return an explicit route not-found state for an unknown collection or unknown brick; do not redirect and do not render a fallback brick.
   8. Keep the sandbox read-only and independent of Next.js, Clerk, Zerospin, grid placement, persistence, drag-and-drop, and per-brick data fixtures.
9. Add the primary sandbox browser seam and package checks.
   1. Configure Playwright for the package's sandbox development target on a port distinct from the private Next application.
   2. Test that `/` exposes all eighteen collection links and that a collection route exposes every variant with the correct two-part brick URL.
   3. Test one static graphic brick, one Unpic-backed image brick, and one GitHub brick at their canonical routes.
   4. Test that changing the grid-unit control changes both preview dimensions while preserving the `w:h` ratio and that the light/dark toggle changes the canvas mode.
   5. Test unknown collection and unknown brick routes independently and assert the explicit not-found content.
   6. Add a package-level catalog invariant test covering unique collection names, unique brick names within each collection, kebab-case identities, and successful exact lookup for every registered variant.
   7. Run `pnpm pack --dry-run` from `packages/bricks` and assert that the tarball contains built JavaScript, declarations, CSS, package metadata, and allowed documentation only; assert that it excludes `workbench`, tests, source, Playwright output, and Vite configuration.
   8. Verify the built package manifest and output expose only the root JavaScript API and stylesheet and contain no unresolved private aliases or Next.js imports.
10. Run private application regression verification through Nx.
    1. Run `pnpm nx run @qrk.sh/bricks:typecheck`, `pnpm nx run @qrk.sh/bricks:lint`, and `pnpm nx run @qrk.sh/bricks:build`.
    2. Run the package's sandbox build and Playwright targets through their resolved Nx names.
    3. Run `pnpm nx run @qrk.sh/web:typecheck` and `pnpm nx run @qrk.sh/web:build`.
    4. Run the existing focused BrickCatalog, BrickCarousel, BrickDetail, and Grid Playwright files against the private web app.
    5. Run `git diff --check` and search for stale app-owned brick imports, duplicate catalog definitions, `next/image` inside the package, and unapproved public subpath exports.
11. Perform a requirement-by-requirement completion audit.
    1. Match every spec user story and implementation decision to the package manifest, built artifacts, sandbox routes, private app imports, or direct test output.
    2. Confirm all eighteen collections moved, every registered variant is reachable by `(collectionName, brickName)`, and the extraction adds no Brick schema or persisted identity changes beyond the separately approved Brick terminology migration.
    3. Confirm consumers require only the root JavaScript import and one stylesheet import and do not configure Tailwind scanning or provide shadcn aliases.
    4. Keep this plan active under `.plans/plans/` until every required build, typecheck, catalog invariant test, sandbox Playwright test, package dry-run inspection, and focused private Playwright regression is green.

## Completion Gate

1. Do not declare completion from typecheck or build alone; package output, tarball contents, all catalog variants, sandbox behavior, and private editor compatibility each require direct evidence.
2. Do not publish the package, create the public repository, redesign GitHub data contracts, or add per-brick fixture APIs under this plan.
3. Do not archive this implementation plan until implementation and all verification targets are complete.
