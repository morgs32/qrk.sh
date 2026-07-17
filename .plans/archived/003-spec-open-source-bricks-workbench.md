# Open-source bricks workbench design

**Date:** 2026-07-16
**Status:** Approved for planning

## Problem Statement

QRK's reusable visual grid content currently lives inside the private Next.js web application. The catalog definitions, brick components, framework-specific image rendering, private shadcn imports, Tailwind output, live GitHub cards, and grid integration are colocated, so the bricks cannot be developed in isolation or later moved to an open-source repository without also carrying private application concerns.

The project already distinguishes a catalog brick variant by the pair `collectionName` and `brickName`, while a GridItem is a placed instance with layout and persistence identity. The extraction must preserve that distinction and current behavior while giving every catalog brick a stable development URL.

## Solution

Incubate a publishable `@qrk.sh/bricks` package with an internal TanStack Start development sandbox in this monorepo. The package owns all eighteen existing brick collections, their catalog metadata, rendering dependencies, shadcn components, compiled stylesheet, and colocated sandbox. The private Next.js application continues to own GridItem placement, persistence, drag-and-drop, drawer behavior, and site routing.

The sandbox consumes only the package's public API. It provides a catalog, collection pages, and a canonical page for each `(collectionName, brickName)` pair while remaining excluded from the published package tarball. Once the boundary is stable, the package and its development sandbox can move together to an open-source repository without redesigning consumer imports.

## User Stories

1. As a brick author, I want to open a URL for one brick variant, so that I can iterate without loading the private site editor.
2. As a brick author, I want to browse all collections and the variants within one collection, so that I can inspect the complete catalog.
3. As a brick author, I want to change the preview grid-unit size, so that I can inspect a brick at multiple proportional render sizes.
4. As a brick author, I want light and dark preview canvases, so that I can detect visual assumptions in a brick.
5. As a private QRK application, I want to import the catalog from `@qrk.sh/bricks`, so that persisted `collectionName` and `brickName` values resolve without private catalog duplication.
6. As a future open-source consumer, I want package-owned CSS and UI dependencies, so that I do not need QRK's Tailwind scanner configuration, theme tokens, shadcn aliases, or Next.js runtime.
7. As an existing QRK user, I want all current brick collections, including GitHub, Figma, and Image, to keep their current visible behavior after extraction.

## Implementation Decisions

1. Name the reusable package `@qrk.sh/bricks` and call its colocated TanStack Start application the brick development sandbox; do not create a second package name.
2. Incubate one `@qrk.sh/bricks` package/Nx project in the current pnpm/Nx monorepo before extracting it into a public repository.
3. Use `brick`, `collection`, `brick variant`, and `GridItem` consistently. A brick variant's catalog identity remains the two-part `(collectionName, brickName)` pair; do not introduce a combined block slug.
4. Move all eighteen existing collections, `BrickFrame`, catalog types, `makeBrick`, `makeCollection`, `collectionsHash`, and `findCollectionBrick` into the package.
5. Keep Grid, GridItem instance identity, layout geometry, Zustand stores, Zerospin persistence, drag MIME handling, drawer and carousel behavior, and private site routes in the Next.js application.
6. Preserve the zero-prop `ComponentType` brick contract. GitHub bricks remain self-fetching and retain their current data behavior; configurable data props and fixture injection are deferred.
7. Replace package-owned `next/image` imports with `@unpic/react`. Do not add a QRK image adapter or require a framework-specific image component from consumers.
8. Give the package its own shadcn `Card` and `Button` implementations plus their `cn` utility. These are package-internal implementation details and are not part of the root public API.
9. Build and export one package-owned stylesheet containing the Tailwind output and default semantic tokens required by the bricks. Consumers import the stylesheet once and do not configure Tailwind to scan package source.
10. Expose one root catalog API containing `collectionsHash`, `findCollectionBrick`, `IBrick`, `ICollection`, `ICollectionBrick`, and `ICollectionBrickDef`. Export the stylesheet as `@qrk.sh/bricks/styles.css`. Do not add collection, individual-brick, or internal shadcn subpath APIs.
11. Update the private Next.js application to consume the package root API and stylesheet while preserving persisted catalog identities and existing component props.
12. Give the sandbox three route surfaces: `/` for all collections, `/collections/$collectionName` for every variant in one collection, and `/bricks/$collectionName/$brickName` for one canonical brick preview.
13. Render an individual brick at its exact `def.w` by `def.h` proportions. Provide an adjustable grid-unit size, a light/dark canvas toggle, and visible collection name, brick name, label, width, and height metadata.
14. Return an explicit not-found route state when either the collection or brick name is unknown. Do not substitute a fallback brick.
15. Keep the sandbox read-only in v1. It does not edit catalog definitions, persist settings, simulate arbitrary component state, or provide per-brick fixture controls.
16. Place the TanStack Start sandbox under `packages/bricks/workbench` without a nested `package.json`; package-root scripts and configuration own its dependencies and development targets.
17. Use TanStack Start file-based routing and keep the sandbox independent of Next.js, Clerk, Zerospin, and private site configuration.
18. Publish through a positive `files` allowlist containing only built library artifacts. Exclude sandbox source, tests, Playwright output, Vite configuration, and private development files from the tarball, and verify the boundary with `pnpm pack --dry-run`.
19. Preserve existing code comments unless they become irrelevant after the move. Do not introduce unrelated abstractions, barrel layers beyond the required package entrypoint, or changes to existing web component props.
20. Resolve the existing duplicate Nx project-name conflict for vendored Effect projects only as required to make the new package and sandbox discoverable and runnable through pnpm-prefixed Nx commands; do not otherwise reorganize vendor content.

## Testing Decisions

1. Use Playwright against the TanStack Start sandbox as the primary acceptance seam.
2. Verify the catalog page links every collection, a collection page renders all of its variants, and every generated brick link uses the two-part route identity.
3. Verify a representative static brick, image brick, and self-fetching GitHub brick render through the package in the sandbox.
4. Verify the individual route preserves `w:h` proportions while changing grid-unit size and visibly switches between light and dark canvases.
5. Verify unknown collection and brick names produce the explicit not-found state without rendering a fallback.
6. Verify the package can build and typecheck independently and that its published manifest exposes only the root API and stylesheet.
7. Keep the existing Next.js BrickCatalog, BrickCarousel, BrickDetail, and Grid Playwright suites as the private-application regression seam; they must continue resolving and placing bricks by `collectionName` and `brickName`.
8. Run package build/typecheck, sandbox build/typecheck, sandbox Playwright, `pnpm pack --dry-run`, and the existing focused Next.js brick/grid Playwright suites through pnpm-prefixed Nx targets.

## Out of Scope

1. Publishing to npm or creating the public repository.
2. Changing the persisted Grid or GridItem schema.
3. Combining `collectionName` and `brickName` into one slug or identifier.
4. Redesigning bricks to accept data props, context, providers, or fixture contracts.
5. Replacing SWR or changing the GitHub API behavior.
6. Building a Storybook, visual editor, screenshot approval service, or general component documentation platform.
7. Exposing package-owned shadcn components for general consumer use.
8. Refactoring existing brick markup solely to make it more concise.

## Further Notes

1. The later public-repository move should preserve the package name, root imports, stylesheet import, route identity, and sandbox behavior established here.
2. Remote promotional image ownership and licensing must be reviewed before the repository becomes public, but that review does not block private-monorepo incubation.
3. TanStack Start is currently release-candidate software; the implementation plan should pin compatible package versions rather than depend on unbounded latest versions.
