# App

App serves the editor at <https://app.qrk.localhost/>.

| Area | Worker                    | Pure manifest           |
| ---- | ------------------------- | ----------------------- |
| User | `zerospin/node.worker.ts` | `userSessionDefinition` |

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
The initializer now receives the bundler SharedWorker URL as `sharedWorkerUrl`;
Zerospin owns worker creation. Native session/SharedWorker phase instrumentation,
early failed-session inspection and session-startup correlation still require
activating native diagnostics for development builds.

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
