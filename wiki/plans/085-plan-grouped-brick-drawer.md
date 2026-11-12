# Grouped Brick drawer and configuration

## Goal and decisions

1. Replace direct catalog dragging with curated horizontal rows and a configuration view. Group GitHub previews together and show captioned Image, captionless Image, and Image Carousel together. Keep category filters; initially give each other module its own row.
2. Selecting a preview chooses its module-owned layout. Show a blank live configuration except for genuine module defaults; Swatch and Icon captures its current animated state at selection. Enable dragging only when the draft is complete, valid, and no work is pending. Return to the catalog after a successful drop and retain the draft after a cancelled or rejected drop.
3. Send the chosen layout ID and configured state to creation. The backend resolves the module-owned layout and copies its spec to all four Placements. Validate completeness on creation and updates; keep incomplete form edits local.
4. Image requires a source and nonempty alt text, separate from an optional caption. Carousel requires at least two images, each with nonempty alt text. Behance requires at least one selected project. A blank Article is valid and remains inline editable.
5. Retain existing provider workflows. Existing lookups must finish successfully; Spotify and Buy Me a Coffee require supported URLs without new provider checks. The backend checks provider data's presence and shape, not its provenance.
6. Preserve existing canonical selections and registrations and historical release behavior. The user alone changes canonical selections. Reset affected local development storage only if needed; production reset and deployment are out of scope.

## Examples

```ts
// The chosen ID resolves to a module-owned spec on the backend.
{ moduleId: "image", layoutId: "captionless", state: configuredState }

// Blank caption is valid; alt text is required.
{ imageUrl: "…", altText: "Mountain lake", caption: "" }
```

## Work and verification

1. Add module-owned layout choices and completeness validation without changing historical release behavior.
2. Implement the grouped catalog and selected configuration state, including module forms' draft and readiness reporting and successful-drop acknowledgement.
3. Add candidate commands and owner release with layout resolution and completeness checks, preserving all existing registry entries and canonical selections.
4. Verify grouped filtering, selection, live drafts, pending and invalid states, Swatch snapshot, cancelled and successful drops, completeness, layout resolution, and all four Placement specs. Use the approved direct contract-evaluation seam for actor commands alongside System harness checks; report its admission and delivery limitations.
5. Run the backend Nx test target and relevant App and Bricks build or Storybook checks. The user performs manual verification.
6. Reconcile the glossary with the implemented result, create an ADR only if warranted, then archive this plan when implementation and required checks are complete.

## Planned file areas

Legend: `+` create, `~` modify.

```text
qrk.sh/
├── apps/
│   ├── app/
│   │   ├── app/[username]/site/[siteId]/page/[pageId]/Modules/  ~ drawer
│   │   ├── components/WallEditor/                               ~ drag and stories
│   │   └── modules/README.md                                   ~ documentation
│   ├── bricks/src/                                             ~ definitions, forms, views
│   └── zerospin/                                               + candidate releases; ~ tests
└── wiki/
    ├── plans/085-plan-grouped-brick-drawer.md                   + this plan
    └── glossary.md                                             ~ after implementation
```

## Remaining work

1. Verify the drawer with the App session targeting release 18. A canonical change is not established as a prerequisite: admission and original execution use the command's release, while older-release replay can record an unsupported outcome. Live fanout, publication and browser synchronization remain unverified; successful local staging alone does not establish them.
2. Resolve retained-history compatibility before any production promotion. A focused test adapts a historical Image creation with null state and shows that candidate command evaluation rejects it. This is not a full replay or publication test. Production reset and deployment are not authorized. Only the user may change canonical selections.
3. Execute the scripted Storybook interactions or otherwise verify the drawer scenarios. The stories compile, but this checkout has no configured Storybook interaction test runner. The user performs manual verification.
4. Archive this plan after the outstanding release and verification work is complete.

## Evidence so far

1. The backend Nx test target passed all 42 tests, including candidate creation, update, layout and adapter checks. A focused test demonstrates rejection of the adapted legacy null-state Image command.
2. App and Bricks TypeScript checks passed; App build and App and Bricks Storybook builds passed. The scripted Storybook interaction code has not been executed.
3. Updated the App module documentation and glossary for the implemented drawer. No ADR was created.
4. On 2026-11-12, reset the authorized local QRK development Worker store by moving `apps/zerospin/.wrangler/zerospin/dev-worker/sys_qrk_sh_1` to `apps/zerospin/.wrangler/zerospin/grouped-drawer-reset-MmCwWW/sys_qrk_sh_1`. No active Portless route or open file under the store was observed. Browser storage was not cleared; an already-used release 18 browser partition may need separate investigation if it retains stale state.
