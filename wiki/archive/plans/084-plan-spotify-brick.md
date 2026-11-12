# Spotify Brick

## Goal and decisions

1. Add a Spotify-owned player Brick for tracks, albums, playlists, artists, shows, and episodes. Creators paste direct or shortened Spotify links; Spotify renders and controls playback.
2. Support Wall resizing with a 320px minimum width, 180px minimum height, and 360px default height. Keep the player interactive in the editor and add an Edit action to the existing menu for sidebar-backed Bricks.
3. Resolve short links through a Spotify-owned worker operation exposed as `resolveSpotifyLink(url)` in Bricks RPC. Save only validated direct Spotify URLs; preserve failed drafts and existing saved state.
4. Defer listening activity, account connections, search, and appearance customization. Keep all existing System registrations and canonical selections.
5. On 2026-11-12 the user explicitly accepted Spotify's [Widget Terms](https://developer.spotify.com/documentation/embeds/terms) for QRK and chose to verify the player, resizing, and short links personally. The applicability of the commercial-use and third-party-site provisions to QRK remains a separate, unresolved question; acceptance does not authorize deployment or determine compliance.

## Examples

1. A creator pastes `https://open.spotify.com/track/<id>`: validate and save the canonical track URL, then the player derives the Spotify embed URL.
2. A creator pastes a `https://spotify.link/<id>` URL: resolve it through the bounded worker, validate the destination, and save the canonical URL. A failed lookup leaves the draft and prior saved content intact.

## Steps and verification

1. Add the Spotify definition, form, player, view, Music category entry, story, and module-owned resolver. Constrain redirect targets, time, and hops; never render returned HTML.
2. Register the module in Bricks and App and add the shared Brick action-menu Edit action for sidebar-backed modules. Extend the latest domain and browser declaration lineage using upgrade APIs, retaining all releases and canonical selections. Update the existing Web snapshot seam without inventing a public page pipeline.
3. Test direct and short URLs, unsafe redirects, failures, cancellation, preserved saves, menu behavior, candidate adapters, replay, and publication progress. Run Bricks checks and Storybook build, App and Web builds, and the Zerospin backend test target. The user verifies the actual Spotify player and short links manually.
4. After implementation, reconcile `wiki/glossary.md` with implemented terminology and create an ADR only for an implemented decision meeting all repository criteria. The user performs manual verification.

## Implementation and verification evidence

1. Spotify module, short-link RPC resolver, Music catalog entry, shared sidebar-Brick Edit action, candidate User V17 and browser/snapshot bindings are implemented. The glossary was reconciled; no ADR was created for this reversible integration.
2. Four focused mocked resolver tests passed. The Zerospin backend target passed 11 files and 39 tests, including the Brick adapters. Bricks and App Storybook builds, the App build, and the Web build using `--webpack` passed. App and Bricks TypeScript checks passed. No real Spotify widget was loaded.
3. An isolated probe replayed local archive indices 1–4 into V17, then added, updated, and published a Spotify Brick under both sizing modes. V9 replay advanced across the V17 Spotify add and update as unsupported. The live local V17 subscriber acknowledged frontier 4, materialized and published through 4, and had an empty outbox. This is local-prefix evidence, not production readiness. Canonical remains V9.
4. The Spotify form and Wall menu interaction stories were built, but their play assertions were not executed: the workspace has no configured Storybook test runner. The user will verify the player, resizing, and short links manually; the Brick menu Edit action can also be checked then. Actual Spotify behavior has not been verified by the agent.
5. The user accepted Spotify's Widget Terms for QRK on 2026-11-12. Their applicability to commercial and third-party sites remains unresolved for public rollout. The user may separately decide whether to handwrite a canonical promotion; neither a promotion nor deployment was performed.

## Remaining work

None for implementation. The user performs manual verification on their own time.
