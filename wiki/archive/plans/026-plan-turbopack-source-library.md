# Turbopack with direct Library source imports

Status: Complete and archived on 2026-10-16. Approved implementation, dist-absent builds/startup, source HMR, browser sessions, asset delivery, and retained-cache timing verification passed.

## Agreed outcome and boundaries

1. Run Studio and Library development servers with Turbopack. Keep Studio's production build and use Turbopack there too.
2. Make Library a private source package. Preserve every existing `@qrk.sh/library/...` import, mapping it to its defining TypeScript, TSX, or stylesheet source so each consumer compiles the source it uses.
3. Remove Library's package build, Next production build, and production preview. Retain its development server, Storybook, and Vite tooling used by Storybook and examples.
4. Preserve stylesheet order, Article font imports, API rewrites, ports, environment settings, Studio's `/studio-static` asset prefix, and SharedWorker identities. Preserve unrelated publishing work, backend storage, browser storage, and cookies.
5. Keep current Next and Zerospin versions. Rely on Next's existing filesystem-cache defaults; do not clear `.next` between runs or add speculative import optimizations, transpilation settings, dependencies, or test infrastructure.

## Implementation

1. Replace Library's generated-file export conditions with direct source paths, including its publishing snapshot exports. Mark the package private and remove `dist` packaging metadata.
2. Map `/bricks.css` to `bricks.css` and `/article-editor.css` to `modules/article/article-editor.scss`. Preserve import order and the existing Article components' font imports.
3. Remove Library's packaging script, `vite.lib.config.ts`, and `tsconfig.build.json`. Remove its Next build and preview scripts and targets while retaining Storybook targets.
4. Remove Library-build prerequisites from every Studio target, API development/build, and Zerospin development. Keep all other service dependencies.
5. Replace both Next webpack hooks with Turbopack's WASM alias, and remove webpack flags from Studio development/build and Library development.
6. Update startup, build, source-export, and cache documentation. Record actual verification below. After implementation, reconcile the existing glossary with implemented terminology; no new domain terminology or ADR is expected. Create an ADR only if the implemented decision proves hard to reverse, surprising without context, and the result of a real trade-off.
7. Archive this plan only after implementation and all required verification pass, retaining its filename and repairing affected links.

Representative source exports retain consumer import names:

```jsonc
{
  "private": true,
  "exports": {
    // 1. Studio compiles the defining component source directly.
    "./Drawer": "./lib/Drawer.tsx",
    // 2. Backend consumers compile only their reachable source graph.
    "./libraryModule": "./libraryModule/libraryModule.ts",
    // 3. Keep the stylesheet import name while compiling its original SCSS.
    "./article-editor.css": "./modules/article/article-editor.scss"
  }
}
```

Both Next configurations preserve the async SQLite fallback:

```ts
turbopack: {
  resolveAlias: {
    // 1. Preserve the installed runtime's matching WASM bytes.
    // 2. Use the Turbopack alias key without webpack's trailing "$".
    "wa-sqlite-async.wasm": "@zerospin/browser/sqlite.wasm",
  },
},
```

The rejected alternative was retaining a separate Vite/declaration build before consumers: it adds startup work and makes source changes depend on generated outputs. Extra cache flags and `transpilePackages` configuration are unnecessary for this approved migration.

## Planned files

Legend: `+` create, `~` modify, `-` remove. Rooted at `qrk.sh/`.

```text
qrk.sh/
├── ~ README.md
├── apps/
│   ├── library/
│   │   ├── ~ package.json
│   │   ├── ~ next.config.ts
│   │   ├── ~ project.json
│   │   ├── ~ README.md
│   │   ├── - vite.lib.config.ts
│   │   └── - tsconfig.build.json
│   ├── studio/
│   │   ├── ~ package.json
│   │   ├── ~ next.config.ts
│   │   ├── ~ project.json
│   │   └── ~ README.md
│   ├── api/
│   │   └── ~ project.json
│   └── zerospin/
│       └── ~ package.json
└── wiki/plans/
    └── + 026-plan-turbopack-source-library.md
```

## Verification

1. Before editing, measure development readiness, first-page latency, cached restart latency, and Studio production-build duration. Retain caches and note any contention that limits comparisons.
2. Temporarily move Library's generated `dist` aside, preserving it for restoration, and verify normal startup plus Studio's production build. No task may invoke a Library build.
3. Make and restore a temporary visible Library source edit; verify Studio refreshes directly. Review Article typography/editor styles and a representative brick in the existing Chrome profile using compatible existing state or a fresh origin, without resetting preserved storage.
4. Verify both SharedWorkers load their WASM and initialize SQLite. Check Studio chunks, worker, and WASM through Web's `/studio-static` proxy in development and production.
5. Confirm API and Zerospin compile source imports and reach their normal readiness signals. Preserve their persistent storage.
6. Repeat comparable development and build measurements with caches retained; report results and comparison limits. Use normal compilation and manual review, without adding suites or standalone check gates.

### Baseline evidence

1. Logs and metrics are under `/tmp/qrk-turbopack-zdVI6f/`. No caches were cleared.
2. The baseline Studio production task passed in 116.11 seconds overall. Nx reported Library at 81 seconds (including Vite at 1.36 seconds and declaration generation) and Studio at 31.9 seconds. Existing development servers initially ran concurrently before being stopped; contention limits this build comparison.
3. Normal `pnpm dev` with streamed logs and retained caches produced these measurements in `baseline-restart-metrics.json`:

   | Signal | Elapsed time |
   | --- | ---: |
   | Web ready | 2.051 s |
   | Studio and Library ready | 14.767 s |
   | API ready | 17.203 s |
   | Zerospin accepted | 17.609 s |
   | First direct Studio `/morgs32` GET, HTTP 200 | 7.902 s |
   | First Library `/` GET, HTTP 200 | 17.357 s |

4. Before migration, the existing Chrome `/morgs32` page showed **Loading account**. HTTP readiness does not establish initialized browser-session correctness; the preexisting condition must remain separate from migration results.

### Post-change evidence

1. Studio's first Turbopack production build passed with `apps/library/dist` moved aside to `/tmp/qrk-turbopack-zdVI6f/library-dist`. Nx invoked only Studio's build task, with no Library target.
2. That build took 22.02 seconds overall; Nx reported 21.1 seconds, including 10.2 seconds of compilation and 7.9 seconds of Next TypeScript checking. This removes the baseline's 81-second Library prerequisite, but the baseline's initial server contention limits an end-to-end speedup claim.
3. The warm Studio production build passed in 6.96 seconds overall (6.3 seconds reported by Nx). API's dry-run source build passed in 1.7 seconds.
4. The first normal Turbopack `pnpm dev` reached all readiness/accepted signals in 5.510 seconds; Studio and Library were ready in 1.637 seconds. First direct requests returned HTTP 200 in 5.244 seconds for Studio and 8.751 seconds for Library. Caches were retained.
5. The existing authenticated Chrome dashboard displayed its saved site, and the connected WebSocket returned 101. The baseline **Loading account** state resolved normally and is not a current blocker.
6. Browser requests loaded Studio's `/studio-static/_next/static/media/wa-sqlite.1tf3cg-ok4dlh.wasm` and Library's corresponding `/_next/static/media/` synchronous projection WASM with HTTP 200 and `application/wasm`, with no failed requests observed. These 617,127-byte files are distinct from the SharedWorker's async WASM. Library DevTools returned wall row `wal_library`, establishing initialized SQLite rather than only asset availability.
7. Direct-source HMR passed: a temporary visible `body::after` marker in Library's `article-editor.scss` appeared in Studio through the preserved source export and in Library through its source imports, without a package build or page reload. The marker was removed, the original SHA-256 matched byte-for-byte, and both apps stopped displaying it.
8. Development catalogs rendered all ten module previews, including Mapbox, GitHub, and Article. Article editor/read-only computed typography was `Spectral, Georgia, serif` at 19 px in both apps, with fonts loaded and no console errors observed.
9. Production runtime passed through Web: Studio's built `start` target listened on port 3001 with readiness at 149 ms, alongside Web/API/Zerospin support services. Reloading `localhost:3000/morgs32` initialized the authenticated session and rendered the same saved site and full catalog with no console errors. A direct production `/morgs32` request returned HTTP 200 in 0.294 seconds.
10. Both proxied production async asset URLs, `sqlite.2np2xsk5j0wd7.wasm` and `wa-sqlite-async.2np2xsk5j0wd7.wasm`, returned HTTP 200, `application/wasm`, and 1,263,008 bytes. Their SHA-256 values exactly matched installed `@zerospin/browser/dist/sqlite.wasm` (prefix `6bfcf02f`). Active connected and standalone sessions plus database reads established initialization.
11. Final warm development restart measurements, still with `dist` absent, are recorded in `turbopack-warm-metrics.json`:

    | Signal | Baseline retained-cache restart | Turbopack warm restart |
    | --- | ---: | ---: |
    | Web ready | 2.051 s | 2.250 s |
    | Studio and Library ready | 14.767 s | 2.251 s |
    | API ready | 17.203 s | 6.134 s |
    | Zerospin accepted | 17.609 s | 8.782 s |
    | First direct Studio GET, HTTP 200 | 7.902 s | 1.883 s |
    | First Library GET, HTTP 200 | 17.357 s | 3.185 s |

12. Source-export inspection preserved all 22 export keys and existing dependencies/versions; every source target exists. Resolved Nx Library targets are only `dev`, `format`, `storybook`, and `build-storybook`. Studio targets have no Library-build dependencies, and API/Zerospin source graphs compile and reach their readiness signals.
13. After restart, the existing Chrome Studio dashboard displayed the saved site and catalog; Library Article detail/grid initialized, with zero console errors. All five development ports were listening and the backend accepted signal was present. Source review found no actionable findings, and scoped `git diff --check` passed.
14. After all absent-`dist` proofs, the preserved ignored Library `dist` directory was restored; exports do not reference it. Next caches, backend state, browser storage, and cookies remained intact. No test suite or standalone check gate was added.
15. Affected startup/build/source-export documentation reflects the implemented migration. Existing glossary terminology needs no additions and no decision meets all ADR criteria, so no glossary or ADR changes were made.

## Remaining work

None.
