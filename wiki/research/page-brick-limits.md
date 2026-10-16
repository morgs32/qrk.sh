# Module-defined page brick limits

Researched against QRK source and official API documentation on 2026-10-14.

## API and ownership

Declare optional `maxPerPage` on the stable `defineModule` identity. Article
sets `1`; Instagram sets `2`. Omitted means unlimited, and supplied values must
be positive integers. The module owns its maximum; the shared Library contract
owns generic enforcement. This policy applies everywhere the module is used.
[Module identity](../../apps/library/make/defineModule.ts),
[Article](../../apps/library/modules/article/article.ts),
[Instagram](../../apps/library/modules/instagram/instagram.ts).

```ts
// Add to Article's existing defineModule declaration.
maxPerPage: 1, // Maximum count; an article is optional.

// Add to Instagram's existing defineModule declaration.
maxPerPage: 2,
```

`makeModuleVersion` explicitly reconstructs identity metadata, so it must preserve
the maximum for both backend and view consumers. The limit belongs to the stable
module ID rather than its state-schema or rendering version.
[Module version factory](../../apps/library/make/makeModuleVersion.ts),
[View factory](../../apps/library/make/makeModuleView.tsx).

## Enforcement and counting

A QRK Page references a Library wall. Brick records contain `wallId` and
`moduleId`, while responsive placements reference a brick. Count matching brick
records once, including hidden and unconfigured bricks. Removal frees capacity.
Existing over-limit pages retain their content; new additions remain blocked
until the count is below the maximum.
[Page model](../../apps/zerospin/src/aggregates/user/models/page/PageV1.ts),
[Brick model](../../apps/library/libraryModule/models/brick/makeBrickModel.ts),
[Removal contract](../../apps/library/libraryModule/contracts/removeBrick/RemoveBrickContractV1.ts).

The `addBrick` guard already loads the wall's bricks for layout validation. It
rejects a matching count greater than or equal to the module maximum with
`add-brick-module-limit-reached`, status `409`. Catalog and detail previews use
the same metadata to show the limit and disable dragging; the wall refuses
excess drops. UI feedback supplements contract enforcement.
[Add contract](../../apps/library/libraryModule/contracts/addBrick/AddBrickContractV1.ts),
[Catalog preview](../../apps/library/lib/ModulePreview.tsx),
[Wall](../../apps/library/lib/BrickWall.tsx).

## Primary-source comparisons

- WordPress declares singleton behavior on a block with `supports.multiple: false`
  and dims its inserter after one instance. A numeric module field covers both
  QRK's singleton Article and two-instance Instagram requirements.
  [WordPress block supports](https://developer.wordpress.org/block-editor/reference-guides/block-api/block-supports/#multiple).
- Sanity offers `max(maxLength)` separately from `custom(fn)` for array validation.
  This supports using a declarative number for a fixed cardinality rule.
  [Sanity arrays](https://www.sanity.io/docs/studio/array-type#validation).
- Sanity documents that Studio schema validation does not enforce writes made
  through its mutation API. QRK's corresponding invariant must therefore be
  enforced by its own write contract, alongside editor feedback.
  [Sanity validation and Content Lake](https://www.sanity.io/docs/content-lake/schema-validation-and-the-content-lake).

Callbacks such as `canAdd(context)` and per-page policy maps would support
conditional rules, but the approved requirement is fixed module-owned maximums.
They are not needed for this API.

## Verification

Library and Studio typechecking and lint passed, together with Library's reusable
build, scoped formatting checks, and `git diff --check`. No Library tests were
written or run.

Manual checks in the existing Chrome profile confirmed the first Article was
accepted, a second was disabled in the catalog and all eight module detail
previews, and two unconfigured Instagram bricks were accepted before a third
was disabled. Hiding Article at the active breakpoint kept its slot occupied.
Removing Article and one Instagram immediately restored their respective drag
eligibility. The three verification bricks were removed afterward.

Multi-page isolation was reviewed against the explicit wall-scoped queries.
Rapid local staging and concurrent authoritative admission were reviewed against
the installed Zerospin 11.1.0 transaction paths; these were source checks, not a
live Studio multi-client exercise. Ordinary guards precede programs, and the
existing authoritative owner serializes evaluation and applying operations
within its transaction. No additional reservation state is needed.
[Library guard](../../apps/library/libraryModule/contracts/addBrick/AddBrickContractV1.ts),
[Server command execution](../../apps/zerospin/node_modules/system-worker/src/AggregateVersionRepo/executeCommand/executeCommand.ts),
[Standalone command execution](../../apps/library/node_modules/@zerospin/browser/src/StandaloneNode/executeStandaloneCommand.ts).
