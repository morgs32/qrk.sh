# Contract payload history without `payloadShapes`

Researched 2026-10-25 against the current Zerospin checkout (HEAD `0b9a46057e`, with unrelated uncommitted factory-owned release-spec and owner-local Agent work). This is a design investigation, not an implemented change. No code, tests, storage, or dependency state was changed for this note.

## What actually needs preserving

The catalogue needs enough immutable historical metadata to detect a changed interpretation of retained command input. Its comparator JSON-encodes accepted and incoming specs and reports their structural difference; it has no special dependency on a property named `payloadShapes`. Registration checks retained catalogue entries rather than accepting the running declarations implicitly. [Comparator](../../../zerospin/packages/system-worker/src/SystemRepo/assertAcceptedSpec/assertAcceptedSpec.ts#L18), [registration comparison](../../../zerospin/packages/system-worker/src/SystemRepo/acceptedDefinitions/requireAcceptedDefinitionEntries.ts#L28).

There is a concrete counterexample to comparing only the current payload: two `recordReceipt@2` declarations both accept text, but one descends from an integer `recordReceipt@1` and the other from a text `recordReceipt@1`. The current regression requires their release specs to differ and also requires constructing V3 to leave V2's captured release spec unchanged. [Existing regression](../../../zerospin/packages/system-worker/tests/repo-names/repo-names.spec.ts#L210).

Execution does **not** read the portable `payloadShapes` object. Decoding finds an executable declaration through `.previous`/`.next`; adaptation validates the source declaration's `payload`, calls the chosen edge adapter, and validates the destination declaration's `payload`. The portable history is equality/display metadata, not an execution registry. [Decode traversal](../../../zerospin/packages/core/src/contracts/decodeAndAdaptPayload/decodeAndAdaptPayload.ts#L64), [adaptation](../../../zerospin/packages/core/src/contracts/decodeAndAdaptPayload/adaptPayload/adaptPayload.ts#L46).

## Where the extra object comes from

The contract constructor already captures and seals a complete selected-version `contract.spec`: identity, singular `payloadShape`, result/failure schemas, models, and operations. The release projector then reconstructs that selected version and walks the executable lineage to transpose payloads and failures into separate version-indexed maps. Current release/Actor/Agent metadata construction all use that projector. [Contract construction](../../../zerospin/packages/core/src/contracts/make/constructContractVersion.ts#L272), [transposition](../../../zerospin/packages/core/src/system/project/projectContractSpec.ts#L24), [release/Agent callers](../../../zerospin/packages/core/src/declaration/makeReleaseSpecs.ts#L56), [Actor caller](../../../zerospin/packages/core/src/system/project/projectActorSpec.ts#L10).

The other direct consumer is the Declaration Board's payload-field display. Session-lock construction deliberately selects one version's singular `payloadShape`; it does not need the historical maps. Aggregate-session metadata invokes the full projector merely to obtain its selected-version `models`. [Board](../../../zerospin/packages/system-diagrams/src/SystemDiagrams.tsx#L62), [session locks](../../../zerospin/packages/core/src/system/project/projectSessionFacts.ts#L26), [session models](../../../zerospin/packages/core/src/aggregateSession/make/makeAggregateSessionSpec.ts#L13).

## Proposed design: let a contract own its portable lineage

Keep the existing selected-version fields and capture a backward-only portable parent reference when constructing an upgrade:

```ts
// Proposed shape, not current implementation.
spec = {
  commandName,
  version,
  payloadShape,
  failureJsonSchema,
  resultJsonSchema,
  models,
  operations,
  operationsJsonSchema,
  previous: parent?.spec ?? null,
};
```

Release, Actor, and Agent metadata can then reuse `contract.spec`. This removes the separate `payloadShapes` and `failureSchemas` transposition. The factory creates one portable declaration per authored contract version; a later child points backward without modifying its parent's spec. Selected-version session locks continue explicitly choosing their existing fields. This is a proposal derived from the existing sealed per-version spec and selected-version session projection, not a property the current constructor already exposes. [Existing spec](../../../zerospin/packages/core/src/contracts/make/constructContractVersion.ts#L272), [selected session facts](../../../zerospin/packages/core/src/system/project/projectSessionFacts.ts#L30).

The implementation seam is inside contract construction: upgrades currently construct the new sealed contract first and attach its parent through a WeakMap afterward. The parent spec must instead be supplied to the internal finishing path before sealing metadata; reading `next.previous` during the current finish call would be too early. This does not require another authored consumer argument. [Upgrade construction and parent attachment](../../../zerospin/packages/core/src/contracts/make/constructContractVersion.ts#L423).

Keep `next` and executable declarations/callbacks out of this portable graph. The existing metadata sealer only accepts serializable framework metadata, and today's portable equality already excludes adapter/program function bodies. A recursive parent spec would preserve that limitation rather than prove executable equivalence. External response/timeout facts, currently added by the projector, must move into the contract-owned portable metadata as part of replacing the projector. [Sealing](../../../zerospin/packages/core/src/declaration/sealOwnedMetadata.ts#L3), [external metadata](../../../zerospin/packages/core/src/system/project/projectContractSpec.ts#L43).

This choice would deliberately freeze **complete** historical version specs, broadening the compared historical facts beyond today's payload/failure subset. That is coherent with immutable declarations, but should be explicit. JSON serialization still has to represent history somewhere; this design eliminates parallel per-field histories and repeated projection, not the information itself. [Current compared shape](../../../zerospin/packages/core/src/declaration/ReleaseSpecSchemas.ts#L35).

## One alternative, and one approach to reject

A flat array of complete per-version specs also preserves the invariant and may suit consumers that routinely iterate history. It still requires assembling/copying a history collection, while a backward-only parent directly follows the existing lineage and avoids a separate index. Prefer the parent representation unless a real consumer needs flat lookup. This is a design judgment, not a measured performance result. [Existing lineage traversal](../../../zerospin/packages/core/src/contracts/getVersion.ts#L18).

Comparing history on demand is insufficient if the accepted snapshot stores only the head payload: reconstructing both sides from today's executable declarations loses the old historical truth. Separately storing every contract version could solve that, but would introduce catalogue identities and registration work absent from the current owner-spec comparison. Neither is needed to remove these two maps. [Retained comparison](../../../zerospin/packages/system-worker/src/SystemRepo/acceptedDefinitions/requireAcceptedDefinitionEntries.ts#L28), [current owner identities](../../../zerospin/packages/system-worker/src/SystemRepo/registerRepo/requireAcceptedRepoSpecs.ts#L17).

**Recommendation:** preserve historical equality, replace the transposed maps with contract-owned backward-only portable version specs, and keep runtime payload decoding unchanged. No compatibility reader, reset, or deployment is implied by this recommendation. The existing integer/text-history and future-version stability regressions provide the minimum behavioral acceptance examples for a later implementation. [Regression](../../../zerospin/packages/system-worker/tests/repo-names/repo-names.spec.ts#L210).
