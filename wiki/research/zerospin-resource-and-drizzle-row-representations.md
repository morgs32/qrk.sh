# Zerospin resource encoding boundaries

Updated 2026-10-17. The API cleanup and Date correction are implemented and
published as Zerospin `14.0.0`; QRK installs exact `14.0.0` packages. This note
replaces the pre-fix investigation of `13.0.1` with the implemented contract.

## 1. Representations

| Representation | Dates | JSON attributes | Model identity |
| --- | --- | --- | --- |
| Physical SQLite row | Millisecond integers | JSON text | Bound by table |
| Drizzle persistence row (`db.select`) | `Date` | JSON text | Bound by Model |
| Relational row (`db.query`) | `Date` | Authored decoded values | Bound by Model |
| Encoded resource object | `Date` | JSON text | Explicit `modelName` and `version` |
| JSON-compatible resource object | Strings | JSON text | Explicit identity |
| Complete JSON message text | JSON strings | Encoded by nested field codecs | Explicit identity |

Native Dates work in Cloudflare RPC and Cap'n Web, including Cap'n Web over
WebSockets. The explicit JSON conversions belong to the actual message/storage
codecs. [Cloudflare RPC](https://developers.cloudflare.com/workers/runtime-apis/rpc/#structured-cloneable-types-and-more),
[Cap'n Web protocol](https://github.com/cloudflare/capnweb/blob/main/packages/docs/src/content/docs/reference/protocol.md).

Drizzle's `timestamp_ms` mode maps stored integers to Dates. Zerospin's separate
relational schema installs the authored JSON column decoder, while ordinary
persistence selects retain JSON text. [Drizzle timestamp documentation](https://orm.drizzle.team/docs/guides/timestamp-default-value),
[database API](/Users/morgs32/GitHub/zerospin/packages/core/src/drizzle/README.md:3),
[JSON mapper](/Users/morgs32/GitHub/zerospin/packages/shapes/src/primitiveMaps.ts:338).

## 2. API names identify the conversion

| Current API | Meaning | Previous name |
| --- | --- | --- |
| `model.table.encodeRow` / `decodeRow` | Encode/decode JSON attributes while retaining Dates | Unchanged |
| `encodeRowAsResource(model, row)` | Encode a decoded row's attributes and attach exact model identity | `encodeResource` |
| `makeResourceFromEncodedRow(row, modelSpec)` | Validate an encoded persistence row and attach identity; preserve JSON bytes | `encodeNodeResource` |
| `makeEncodedRowFromResource(resource, modelSpec)` | Validate a complete resource, restore declared Dates, and remove identity for persistence | `decodeNodeResource` |
| `model.resourceJsonCodec` | Decoded complete resource ↔ JSON-compatible object, with Dates represented as strings | `model.resourceSchema` |
| `ResourceEnvelopeJsonCodec` | Generic envelope JSON codec; declares the two framework timestamps | `EncodedResourceSchema` |

`encodeRowAsResource` is defined in
[encodeRowAsResource.ts](/Users/morgs32/GitHub/zerospin/packages/core/src/models/encodeRowAsResource.ts).
The two row/envelope conversions are defined together in
[resourceEnvelope.ts](/Users/morgs32/GitHub/zerospin/packages/core/src/Node/resourceEnvelope.ts).
The JSON codec names describe JSON-compatible objects, not entire JSON strings.
[Model codec](/Users/morgs32/GitHub/zerospin/packages/core/src/models/make/makeModelVersion.ts:449),
[envelope codec](/Users/morgs32/GitHub/zerospin/packages/core/src/models/ResourceEnvelopeJsonCodec.ts).

```ts
// 1. Relational row: native Dates and decoded JSON attributes.
const row = { createdAt: new Date(), settings: { enabled: true } };

// 2. Attribute encoding preserves Date and makes JSON attributes text.
const encodedRow = { ...row, settings: '{"enabled":true}' };

// 3. Resource construction adds the bound identity without encoding again.
const resource = { ...encodedRow, modelName: 'item', version: '1.0.0' };
```

The example illustrates representations; it is not a complete Model resource.
The real helpers validate required fields and exact model identity.

## 3. Complete JSON messages

Compose the existing message schema with `Schema.fromJsonString`; use
`Schema.encodeSync` for JSON text and `Schema.decodeUnknownSync` for the inverse.
Keep resources as objects inside the message. No additional stringify/parse
wrapper was introduced. [Socket message schema](/Users/morgs32/GitHub/zerospin/packages/core/src/aggregateSession/AggregateSocketProtocolSchema.ts),
[socket receiver](/Users/morgs32/GitHub/zerospin/packages/browser/src/AggregateNode/AggregateNodeSynchronization.ts:400).

The generic envelope codec revives `createdAt` and `updatedAt`. Before resource
persistence, `applyNodeResourceDeltaTx` resolves the exact model from the Node
lock and calls `makeEncodedRowFromResource`. Its model-aware encoded-row codec
normalizes every declared Date attribute and validates retained JSON strings.
It does not execute arbitrary authored JSON transformations.
[Delta installation](/Users/morgs32/GitHub/zerospin/packages/core/src/Node/applyNodeResourceDeltaTx.ts),
[encoded-row validation](/Users/morgs32/GitHub/zerospin/packages/shapes/src/makeEncodedShapeRowCodec.ts:18).

Relational application reads subsequently run the executable Model's authored
JSON codec, restoring objects/arrays and nested transformed values. Snapshot
installation uses the same model-aware resource-to-row conversion. Outbox and
history JSON columns compose their existing field codecs to serialize and
revive dates at the storage boundary.
[JSON mapping](/Users/morgs32/GitHub/zerospin/packages/shapes/src/primitiveMaps.ts:338),
[snapshot installation](/Users/morgs32/GitHub/zerospin/packages/core/src/aggregateSession/installAggregateNodeView.ts:94),
[retained delta codec](/Users/morgs32/GitHub/zerospin/packages/core/src/aggregateSession/aggregateExposedCommandsTable.ts:17).

## 4. Implemented fix

The former selection export called a portable encoder while promising an
encoded resource object. Its Dates became strings before the projection's
Date-preserving decoder ran. The corrected encoder uses the existing row codec.
Projection output also retains all declared Dates, and standalone execution
uses its already-encoded persistence rows without JSON decode/re-encode.
[Encoder](/Users/morgs32/GitHub/zerospin/packages/core/src/models/encodeRowAsResource.ts),
[projection reader](/Users/morgs32/GitHub/zerospin/packages/system-worker/src/aggregateProjection/readSelectedResources.ts:43),
[standalone export](/Users/morgs32/GitHub/zerospin/packages/browser/src/StandaloneNode/executeStandaloneCommand.ts:113).

Plan 236 explains why resource export reconstructs identity after removing the
two SQL metadata columns. Its broader deferred verification remains independent
of this scoped fix. [Plan 236](/Users/morgs32/GitHub/zerospin/wiki/plans/236-plan-model-rows-and-resource-envelopes.md:9).

## 5. Verification and release

- All 19 fixed-group packages were published locally as `14.0.0`; registry
  versions, latest tags, and integrity metadata were verified. The release uses
  a major version because the public method/property/import names changed.
- All 18 existing release-group library build targets passed; the nineteenth
  package, `@zerospin/server-only`, directly exports tracked JavaScript files.
- Affected Core/Browser/System Worker/Native lint and type checks passed,
  including Native's existing build. No test files or new check gates were added.
- QRK's 28 framework dependency pins are exact `14.0.0`; frozen offline
  installation and Studio's production build passed.
- With retained backend and browser storage, the User projection advanced from
  zero rows/index 0 to one User/index 6, its source subscriber acknowledged 6,
  and its outbox drained. The existing User ID was preserved. A Chrome visit to
  `http://localhost:3000/morgs32` displayed the dashboard and Create site button.
- No database reset or source commit was performed. Unrelated modified files in
  the original upstream checkout were preserved.

Evidence logs are under `/private/tmp/zerospin-resource-codecs-*.log` and
`/private/tmp/qrk-resource-codecs-*.log`.

**Remaining work:** None for this scoped fix and API cleanup.
