# App

App serves the editor at <https://app.qrk.localhost/>.

The site navbar uses 16px side padding in the sm preview and 24px from the md
preview upward, based on the preview container's 720px threshold.

Workspace drawers use TanStack Hotkeys for Escape dismissal, including while a
form field is focused. Escape uses the Close button's route transition and keeps
the current breakpoint. Open menus, popovers, and dialogs consume Escape
first; the next press closes the workspace drawer. Every workspace drawer has a
Close button in its shared navbar. The standalone Set breakpoints view has no
drawer, so its floating breakpoint toolbar provides Close instead; closing
returns to page controls and keeps the selected breakpoint.

| Area | Worker                    | Pure manifest           |
| ---- | ------------------------- | ----------------------- |
| User | `zerospin/node.worker.ts` | `userSessionDefinition` |

## Brick catalog

The Bricks drawer provides draggable previews with plain module labels. Dragging
creates Bricks through the Wall's existing command path; Brick Details edits saved
Bricks. Module metadata and Component/JsonRender comparisons live in Storybook's
module playgrounds. The App has no per-module inspection pages or URL-driven
Add here/insertion flow.

## Wall dragging

Saved Bricks move from their dedicated grip into existing or new Rows
across the current Wall's existing Stacks and Sections. On compatible populated
Rows, the top/bottom 8px create a Row above/below; the remaining area joins or
reorders horizontally. Incompatible Rows use top/bottom halves for separate Rows.
Empty Rows accept a Placement directly; empty Stack backgrounds create their
first Row. The canvas creates no Stacks or Sections.

The source stays in place at 40% opacity. A noninteractive 2px blue line marks
existing-Row insertion vertically or new-Row insertion horizontally, without
changing layout. Brick content remains interactive, selection and the drawer
remain open, and drawer templates retain their existing shadow feedback.
Cancellation, invalidated destinations, and unchanged drops—including replacing a
singleton Row at its current position—stage no move.

The session pins user owner V9 and web Actor V9. Existing-Row drops stage
`movePlacementToRow@4`, which enforces the shared variant-sharing rule; new-Row
drops stage `movePlacementToNewRow@3`, allocating `newRowId` only after an accepted
drop. The other concrete commands retain explicit IDs for Stack/Section creation,
without canvas gestures. There is no generic identity seed.

V6 retains the V1-to-V2 move contract lineage and valid V5 move history without a
new reset. The earlier local V5 reset is recorded in the [root README](../../README.md).
Pre-V5 generic move history still needs framework historical-execution support
before a retained-data cutover; this update establishes no production migration path.

## Development

```sh
pnpm --filter @qrk.sh/app dev
```

## Portless

```sh
portless get app.qrk
```

## Build

```sh
pnpm --filter @qrk.sh/app build
```

## Preview

```sh
pnpm --filter @qrk.sh/app preview
```

Serves the Vite preview on `PORT` or `10010`.

## Startup timing

Frontend timing is active with the currently installed Zerospin release.
The managed session hook receives the bundler SharedWorker URL as `sharedWorkerUrl`;
Zerospin owns worker creation. Native session/SharedWorker phase instrumentation,
early failed-session inspection and session-startup correlation still require
activating native diagnostics for development builds. The hook observes nonterminal
failures before initialization; ready-only session diagnostics read retained startup
telemetry beneath `SessionReady`, and terminal startup errors use its error view.

Development builds emit native Effect logs for `navigation.html`,
`navigation.dom`, `navigation.first-contentful-paint`, `clerk.ready`,
`credentials.acquire`, `session.ready`, and `dashboard.commit`. Filter the
browser console for `App startup`; the same records appear in the session's
Zerospin DevTools when that release registers the session. Earlier frontend records are
merged into that collector without printing them again.

Each attempt emits one `App startup summary` with `ready`, `failed`, or
`cancelled`, phase durations, a document `navigationId`, a fresh frontend
`startupId`, and the session's `sessionStartupId` when native diagnostics are available. Join the last
field to the native session and SharedWorker traces. Records contain fixed
phase names, timings and error codes; credentials and user/model contents are
excluded. `dashboard.commit` follows the initial user query and measures React
commit, not paint. Missing user content is a failed startup.

HTML, DOM and first-contentful-paint timings use retained browser Performance
entries from document navigation. The first attempt includes time before the
application module was evaluated; subsequent attempts measure their own start.
Frontend and worker durations use their own clocks; compare durations and
correlation IDs, never subtract raw `performance.now()` values across them.

When comparing manual runs, label the run explicitly:

- Restarted development server with retained caches.
- Cleared development caches (only when deliberately requested).
- Fresh browser context.
- Warm reload.

Do not clear existing browser data or caches to collect these timings. A reused
SharedWorker Node will report reuse after native diagnostics are activated; it cannot recreate an earlier cold trace.
Production builds leave startup diagnostics disabled.

## Offline loading and updates

Production builds prepare the App shell, route chunks, SharedWorker, SQLite WASM,
fonts and static assets with a service worker. Successfully visited Clerk SDK
scripts are cached separately; authentication API responses and domain RPC
responses are not resource-cached. No installation manifest is generated. Start
writes the SPA shell after its environment builds, so `qrk-offline-output` runs
Workbox generation after that shell exists. Development builds do not register
the service worker. The development server serves a retirement worker at `/sw.js`
so an existing production registration can stop serving its cached shell. It
claims existing clients and unregisters without reloading them or clearing data.
Its retained asset fallback still serves exact old `/assets/` URLs; subsequent
document navigation uses the network. Production preview serves the real worker.

After a successful online visit, a previously verified user can reopen the exact
saved editor URL and edit its locally saved Page offline. Zerospin restores
only an eligible exact remembered identity and retains pending commands locally.
Reconnection obtains credentials and authoritative authentication before sending
those commands. A resource cache does not authorize backend access. New devices,
missing local Pages and locally invalidated identities cannot acquire data offline.
Clerk startup can delay the initial offline render; an offline reload is not instant.

A downloaded build produces an existing notification with Reload and Later. Later
leaves the current Page usable and cancels any pending reload approval. Reload
activates the waiting build; unsaved forms and active uploads use the browser's
native leave/stay confirmation. Staying keeps the current document and update
notification usable. Saving or canceling the draft removes its warning. The
warning does not wait for pending commands to execute remotely. Registration,
normal browser checks and visible-tab focus/online checks discover updates without
a polling timer or push service. An idle tab is not guaranteed immediate notice.

Zerospin owns command recovery and supported Node storage upgrades across an
ordinary reload independently of Vite PWA. Commands already retained by the Node
or successfully persisted in the tab journal survive supported runtime updates
with the same authored binding. Journal writes remain best effort; this does not
promise recovery of memory-only work after a failed storage write. A compatible
layout reopens normally. A supported SQL upgrade drains its retained old-format
commands and commits forward schema changes before session readiness. QRK adds
no command flush or shutdown protocol to the update button.

Local verification uses the existing `app.qrk.localhost` origin, the documented Web
`__dev` sign-in handoff and the production preview. Do not substitute another
origin to obtain an empty cache. The resource cache is separate from Zerospin
IndexedDB/SQLite state; do not delete domain storage to clear an application build.

Sign out uses `useClearSessionAuthentication(userSessionDefinition)` before
Clerk's sign-out action. Zerospin stops synchronization and invalidates remembered
offline eligibility before Clerk redirects to Web. Saved models remain on the
device; a fresh online verification is required to reopen them.

Each production build has a separate Workbox resource cache. `offline-cache.js`
serves immutable old `/assets/` chunks to tabs still running an earlier build.
It matches the exact asset URL while ignoring `Vary` headers, because native
module requests can send a different `Origin` header from precache requests.
When only one controlled App tab remains, it reports its entry-module URL; if
that module belongs to the active build and no build is installing/waiting, the
worker removes old App precaches. Multiple tabs conservatively retain old builds
until that single-current-tab condition holds. Clerk's static cache and domain
storage are outside this cleanup. This avoids forcing a tab that chose Later to
reload when another tab accepts an update. GenerateSW's `cacheId` and imported
script integration are documented in [Workbox's build options](https://developer.chrome.com/docs/workbox/modules/workbox-build).

Implementation and measured limits: [Plan 054](../../wiki/archive/plans/054-plan-client-updates-and-reload-durability.md)
and [completed Plan 053](../../wiki/archive/plans/053-plan-offline-loading-and-update-prompts.md).
