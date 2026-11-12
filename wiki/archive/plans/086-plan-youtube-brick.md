# YouTube Brick

## Problem and decisions

1. Add one Social-category YouTube Brick that embeds a creator-selected video or playlist. Creators paste YouTube links; use the existing Brick editor and its Edit menu action. Unlike two separate modules, one Brick can switch between a video and playlist without replacement.
2. Parse supported YouTube watch, share, embed, Shorts, and playlist URLs locally. When a link contains both a video and playlist, let the creator choose. Selecting the playlist starts with the linked video; honor a start time from the link. Reject malformed or unsupported links while preserving the draft and previously saved Brick.
3. Use YouTube's privacy-enhanced `youtube-nocookie.com` iframe. Load the player when the page appears, keep YouTube's controls interactive in the Wall editor and for visitors, and wait for the visitor to press Play. QRK adds no tracking or YouTube account connection.
4. The iframe fills the resizable Brick. Add `200` to the existing shared module `minHeight` options and use a 200px minimum for YouTube; use the existing 320px width minimum and 360px preferred height. This keeps the Wall resize clamp consistent with [YouTube's 200×200 minimum](https://developers.google.com/youtube/player_parameters).
5. Record a TODO at the YouTube player and in the completion notes to implement and verify Made for Kids status handling later. YouTube's [developer policies](https://developers.google.com/youtube/terms/developer-policies) require each embedded video's status to be checked and describe data-handling obligations; YouTube itself collects some data when its player loads. QRK-owned tracking is not required for those obligations to apply. The user explicitly chose to defer this check; do not represent the TODO as compliance or silently add a Data API integration.
6. On 2026-11-12 the user explicitly accepted the [YouTube API Services Terms](https://developers.google.com/youtube/terms/api-services-terms-of-service) for QRK and chose to verify the player and resizing personally. This acceptance does not resolve the deferred Made for Kids requirement or authorize public deployment.

## Annotated examples

1. `https://www.youtube.com/watch?v=VIDEO_ID&t=90`: select the video and construct a privacy-enhanced embed starting at 90 seconds. The player waits for Play.
2. `https://www.youtube.com/watch?v=VIDEO_ID&list=PLAYLIST_ID`: show a choice between the video and playlist. Selecting playlist retains both IDs so the player begins at that video and continues through the playlist.
3. A playlist-only link selects the playlist without a video choice. A malformed or unsupported link leaves the previous saved state intact and displays an actionable error.

```ts
// Illustrative only: the module owns parsing and constructing the iframe URL.
// A video-plus-playlist selection retains the linked video as the starting item.
const embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}?listType=playlist&list=${playlistId}&start=${startSeconds}`;
```

## Implementation steps

1. Add a YouTube-owned definition, URL validation/normalization, complete-state schema, form, player, preview/placeholder, and stories. Follow the current creator-configuration and insertion flow. Store the chosen content and relevant start time so reopening the editor preserves the creator's selection. Build iframe URLs from validated identifiers and supported parameters; never render arbitrary pasted iframe HTML.
2. Extend the shared module minimum-height union to include 200 and verify that the existing Wall sizing and resize behavior apply it consistently. Register YouTube in the Social category, Bricks backend and candidate catalogs, package exports, and App module catalog; reuse the existing sidebar-Brick Edit action and interactive iframe behavior.
3. Recheck the latest concurrent development lineage. Evolve the Brick model, affected contract adapters, actor, snapshots, owner release, and App browser session via the installed upgrade APIs. Register a candidate while preserving every existing owner release and canonical selection. Update the existing Web viewer snapshot seam; do not create a new public publishing pipeline or alter Article embedding.
4. Add concise behavior checks for supported video/playlist/Shorts/share URLs, timestamps, ambiguous-link selection, invalid input, preserved drafts, iframe parameters and 200px sizing. Exercise candidate adapters and retained-history replay, including refusal by older releases. Run scoped Bricks checks, App and Web builds, and the Zerospin backend test target; report local publication progress and any missing runtime evidence.
5. After implementation, reconcile the existing glossary with the result. Create an ADR only if an implemented decision is hard to reverse, surprising without context, and the result of a real tradeoff. Follow the implement skill for verification and archival.

## Planned files

`+` creates a file or module directory; `~` modifies existing files. Recheck exact version numbers and concurrent work before editing.

```text
qrk.sh/
├── + apps/bricks/src/modules/youtube/          # definition, form, player, view, stories and tests
├── ~ apps/bricks/src/definition/makeModuleVersion.ts
├── ~ apps/bricks/src/modules/backendLibrary.ts
├── ~ apps/bricks/src/modules/candidateLibrary.ts
├── ~ apps/bricks/package.json
├── ~ apps/app/modules/modulesHash.ts
├── ~ apps/app/zerospin/userSessionDefinition.ts and affected Brick queries
├── + apps/zerospin/src/aggregates/user/        # next model, adapters, actor, snapshot and owner
├── + apps/zerospin/test/                       # candidate and adapter tests
├── ~ apps/zerospin/src/system.ts               # add candidate only
├── ~ apps/web/library/WallViewer.tsx           # evolved snapshot type
└── ~ wiki/glossary.md                          # after implementation
```

## Implementation and verification evidence

1. The YouTube module, local link parsing, ambiguous-link selection, 200px shared minimum, Social category, and V19 candidate/session bindings are implemented. The requested Made for Kids TODO remains in the player; it is not a completed compliance measure. The glossary was reconciled; no ADR was created for this reversible integration.
2. The backend target passed 13 files and 44 tests; three focused YouTube URL tests passed separately. App and Bricks TypeScript checks, Bricks and App Storybook builds, the App build, and the Web build using `--webpack` passed. No real YouTube player was loaded.
3. An isolated in-memory probe replayed read-only fixture archive indices 1–4 into V19, then added, updated, and published a YouTube Brick. V9 advanced across V19's YouTube add/update as unsupported. This does not establish live Chain fanout or publication progress. All previous releases remain registered and canonical remains V9.
4. On a later read-only live observation, V19 had materialized, published, and archived through index 1 with an empty outbox. A subsequent observation showed canonical V9 adopted through 1 and all V9–V19 subscribers acknowledged 1, while the finalized frontier had advanced to 2. This covers the observed prefix only and is not evidence of full catch-up or promotion readiness. No extra verification aggregate was created, and the recovery archive was preserved.
5. The user accepted the YouTube API Services Terms for QRK on 2026-11-12 and will manually verify the actual player and resizing. The Storybook interaction assertion was built but not executed because the workspace has no configured Storybook test runner. The deferred Made for Kids check and playlist handling remain a documented TODO; neither user acceptance nor this implementation establishes compliance.

## Remaining work

None for implementation. The user performs manual verification on their own time. Before recommending any user-handwritten canonical promotion, establish catch-up and publication progress through the then-current frontier.
