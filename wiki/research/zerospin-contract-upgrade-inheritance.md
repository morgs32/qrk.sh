# Zerospin contract upgrades: inherit unchanged declarations

Researched 2026-10-21, then updated after the approved implementation. The original investigation examined installed Zerospin 21.0.0; earlier research in the conversation had examined 20.1.2. References describing the old API are pinned to Zerospin commit `23d09b78da39c589896f2a3abc8bf76be1c46061` and QRK commit `61512d843921a5c4aaf34f72b98d07df4432c8f8` so they remain a 21.0.0 snapshot. No verification runs were performed. [Pre-22 upgrade API][upgrade-api], [pre-22 SDK guidance][sdk-evolution].

## Implementation status

The approved SDK change is implemented in Zerospin commit `c3b379b99d` for release 22.0.1. The runtime inherits omitted callbacks, schemas, and failures; merges operation entries; accepts omitted payload patches; and supplies forward identity when `up` is omitted. The existing destination validation remains in place, and `down` stays explicit. Public inference retains the program and guard requirements through the SDK's `__program` and `__guardRequirements` type facts. These are SDK implementation details, not additional QRK declarations. [Implemented constructor][implemented-construction], [implemented public API][implemented-api], [implemented contract types][implemented-types].

QRK adoption removes repeated upgrade guards/programs and validation-only `up` adapters while retaining contract/model version lineage and stricter spec validators. Version-sensitive inherited callbacks read through `db.models`; the existing provider-state work in `UpdateBrickV1`, `UpdateBrickV2`, and `UpdateBrickV3` is preserved. The resulting declaration shape appears below. [QRK completion upgrade][adopted-completion], [QRK spec upgrade][adopted-spec], [QRK provider-state declarations][adopted-update-brick].

All 19 fixed-group packages were published as 22.0.1 to the local Verdaccio registry, and QRK installed exact 22.0.1 dependencies and updated its lockfile. Zerospin's checkout includes release commit `c0b58b6054`. Only compiler/bundler artifact generation needed for publishing was run; no separate tests, typecheck or lint targets, verification builds, browser audits, or data operations were run for this change.

## Answer

**QRK should not have to supply `payload: {}` and an identity `up` when the payload has not changed.** Their presence was a requirement of the pre-22 SDK implementation. The runtime needs a usable version edge, but Zerospin can create that edge itself when the caller inherits the exact previous payload declaration. Release 22.0.1 implements that default. [Pre-22 public upgrade API][upgrade-api], [pre-22 constructor][upgrade-construction], [implemented constructor][implemented-construction].

An explicit `up` is not inherently necessary when a validator changes, either. Zerospin can pass the decoded value through unchanged and validate it against the destination schema. Compatible history proceeds; incompatible history fails visibly. Requiring an authored adapter for every payload patch would be an additional API policy, not a safety requirement of this runtime. This corrects the more conservative initial proposal in this research. [Destination validation][adapt-traversal].

This is separate from whether an entire inherited program is compatible with PlacementV2. Payload adaptation handles command input. Model reads, operation bindings, guards, and program execution have their own boundaries. The implementation keeps these boundaries and changes how omitted declarations inherit. [Execution resolution][execution-resolution], [contract evaluation][evaluation], [exact read binding][read-binding], [implemented constructor][implemented-construction].

## What the pre-22 API required

The pre-22 TypeScript declaration required a payload patch, an upward adapter, and a newly supplied program. The runtime independently required all three. The SDK's own evolution skill explicitly documented reauthoring guards, claims, operations, results, and programs. Removing the properties only from the TypeScript signature would therefore have failed construction. [Pre-22 API][upgrade-api], [runtime required properties][upgrade-required], [SDK evolution policy][sdk-evolution-policy].

`payload` is already a patch: construction starts with the previous payload, then applies supplied field replacements or removals. An empty patch keeps every previous field. Models are patched in the same way. `up` and `down` are stored on a new lineage edge; the old declaration remains its parent. [Payload/model patching][upgrade-patching], [lineage attachment][lineage-accessors], [edge construction][upgrade-edge].

The pre-22 QRK example was consequently verbose even though its payload was unchanged:

```ts
export const completeGithubRepoV2 = upgradeAggregateContractVersion(
  completeGithubRepo,
  {
    version: "2.0.0",
    up: Effect.fn("completeGithubRepo.up")(function* (props) {
      const { payload } = props;
      return payload;
    }),
    models: { brick, placement },
    operations: {
      updateBrick: brick.operations.update,
      updatePlacement: placement.operations.update,
    },
    payload: {},
    guard: /* repeated guard */,
    program: /* repeated program */,
  },
);
```

Here `placement` is PlacementV2. The historical file repeated the guard and program after this unchanged-payload adapter. [Pre-change QRK V2 declaration][complete-v2], [QRK original declaration][complete-v1].

## What an adapter guarantees

For different contract versions, `decodeAndAdaptPayload` finds the original version in the declaration lineage, decodes using that version, and invokes `adaptPayload` toward the execution version. This supports both forward and backward traversal. [Payload version resolution][decode-adapt].

`adaptPayload` then:

1. Validates the source decoded payload against its source schema.
2. Chooses the `up` or `down` function on each intervening version edge, failing if that function is absent.
3. Runs the function and validates its output against the destination decoded payload schema before proceeding.

The pre-22 constructor required an authored adapter even for an empty patch. Release 22.0.1 creates the forward identity edge when `up` is omitted; traversal and destination validation still apply. [Pre-22 constructor][upgrade-required], [implemented constructor][implemented-construction], [edge selection and destination validation][adapt-traversal].

Successful adaptation means the input satisfies the destination payload schema. It does not mean that the domain guard approves it or that the program can execute successfully against its model state. Canonical execution prepares the adapted invocation, then checks aggregate/actor guards, evaluates the contract guard and program, validates the recorded operation batch and result, and applies operations within a savepoint. [Execution resolution][execution-resolution], [owner evaluation][owner-evaluation], [contract evaluation][evaluation], [transaction execution][transaction-execution].

An adapter does not transform model rows or translate recorded model-operation batches. Model operation codecs bind to an exact model declaration and version; replay rejects an operation when its recorded model version is unavailable. [Operation identity codec][operation-identity], [replay exact model requirement][replay-model-binding].

## Retained history and parallel releases

Admission validates the submitted contract version and its original encoded payload. The validation result does not replace the retained payload bytes. [Admission][admission], [submitted-payload validation][submitted-payload].

The materialization path distinguishes two cases:

1. **First evaluation in a parallel release:** the release resolves its own executing contract, adapts the historical command payload, and evaluates its own guards/program against its own model state. Its resulting operations and outcome are retained.
2. **Reconstruction with that release's retained output:** the runtime reapplies the already recorded model operations at the retained timestamp and republishes the identical complete output. It does not reevaluate the guard/program or rerun payload adaptation on this restoration branch.

These are separate branches in `materializeCommandTx`. The restoration branch skips external/command dispatch operations, applies retained model operations, and retains the same evaluated command. Missing retained output for the command's original aggregate release is an error rather than permission to invent new original output. [Materialization branches][materialize], [execution resolution][execution-resolution], [output restoration][restore], [missing original output][replay-original].

Therefore an SDK-created identity payload edge need not rewrite commands, mutate historical payloads, copy rows between releases, or alter immutable historical output. It removes the need for the caller to author a function that returns the same decoded payload. The implementation uses the existing separation between adaptation, evaluation, and restoration. [Implemented constructor][implemented-construction], [adapter traversal][adapt-traversal], [materialization branches][materialize], [output restoration][restore].

## Implemented SDK omission rules

The change extends `upgradeAggregateContractVersion` itself. QRK needs no factory, adapter wrapper, read/pick declaration, field tracking, casts, or generic arguments for this inheritance. [Implemented public API][implemented-api].

| Upgrade input | Release 22.0.1 behavior |
| --- | --- |
| `payload` omitted or `{}` | Inherit the exact previous payload descriptor set. |
| A nonempty payload patch | Apply the supplied field replacements/removals. Do not require an adapter merely because a validator changed. |
| `up` omitted | Use forward identity, then perform the existing destination-schema validation on every edge. This permits compatible payloads and surfaces incompatible ones; it does not guarantee compatibility. |
| `up` supplied | Run the explicit transformation, then perform the same destination validation. |
| `down` omitted | Keep the current reverse policy: refuse reverse adaptation when a required `down` is missing. Do not infer an inverse from an explicit `up`. |
| `down` supplied | Use the explicit reverse transformation and validate its destination. It does not define the forward transformation. |
| `guard` or `program` omitted | Inherit the authored callback and its inferred requirements; do not replace it with a no-op. |
| `claims`, `result`, or `failures` omitted | Inherit their previous schemas and corresponding inferred types. |
| `models` or `operations` supplied | Patch entries by key, preserving omitted entries and checking the resulting exact model/operation bindings. |

The new edge must not inherit its predecessor's `up` or `down`: those functions transform a different pair of versions. Inherited guard/program behavior and a newly synthesized forward identity edge are different mechanisms. Existing traversal selects the adapter on the particular child edge between the requested versions. [Edge selection][adapt-traversal].

No schema-equality machinery is needed for these defaults. Omission inherits the previous descriptors; a supplied patch changes them; destination validation decides whether a particular value is valid. This also avoids pretending that generated JSON Schema or TypeScript assignability proves arbitrary Effect filters equivalent. QRK's stricter spec includes executable validation of the root's membership in `elements`. [QRK spec filter][spec-filter].

Inheritance required changes to both runtime construction and public inference. Merely making fields optional would have been unsafe in 21: construction retained only the previous failures explicitly, created operations from the supplied map, omitted absent claims/result, and defaulted absent guard/program to no-ops. The old public generics also defaulted operations/result independently of the previous declaration. Release 22.0.1 changes both layers, retaining private authored callbacks and their inferred requirements. [Pre-22 construction defaults][construction-defaults], [pre-22 upgrade construction][upgrade-edge], [pre-22 generics][upgrade-generics], [implemented constructor][implemented-construction], [implemented public API][implemented-api].

Zerospin already has a related public precedent: `updateAggregateActorVersion` inherits omitted settings and authorization while merging supplied selection/contract entries. That supports this omission policy without introducing a second QRK abstraction. [Actor upgrade inference][actor-upgrade-inference], [actor upgrade construction][actor-upgrade-construction].

## QRK declaration after the SDK fix

A PlacementV2 upgrade with no command-payload change has this declaration shape:

```ts
export const completeGithubRepoV2 = upgradeAggregateContractVersion(
  completeGithubRepo,
  {
    version: "2.0.0",
    models: { placement: placementV2 },
    operations: {
      updatePlacement: placementV2.operations.update,
    },
  },
);
```

This keeps the existing payload, guard, program, failures, claims, result, Brick binding, and `updateBrick`; it replaces only the Placement binding and its update operation. Forward payload version traversal still happens through SDK-created identity edges with destination validation. The approved implementation and QRK adoption are written; no typecheck or runtime verification was run. [Implemented public API][implemented-api], [implemented constructor][implemented-construction], [QRK adoption][adopted-completion].

The pre-change V1 callback closed over `placementV1` in its `findFirst` calls, and the read scope requires the exact configured model object. Reusing that closure while only changing the model map would fail. QRK adoption changes version-sensitive reads to the existing `db.models` map, using `model: db.models.placement`. Adding optional properties alone would not solve this problem; the adoption does not introduce a read DSL or generic plumbing. [Pre-change captured model reads][complete-v1-reads], [existing model map][read-model-map], [exact read binding][read-binding], [adopted V1 read bindings][adopted-completion-v1].

## A changed validator does not require a transformation

The manual spec command changes its payload validator as well as its Placement model. Its pre-change adapter validated a historical spec and returned the same document shape, with the bespoke `update-github-repo-spec-invalid-history` error mapping. It did not manufacture or convert the spec. Destination validation can enforce the stricter schema without requiring QRK to author that forward identity. The adoption keeps the validator and omits the validation-only adapter. [Pre-change spec command upgrade][spec-command-v2], [PlacementV2][placement-v2], [destination validation][adapt-traversal], [adopted spec upgrade][adopted-spec].

With release 22.0.1, the schema change stays explicit while the redundant adapter disappears:

```ts
upgradeAggregateContractVersion(updateGithubRepoSpecAtBreakpoint, {
  version: "2.0.0",
  models: { placement: placementV2 },
  operations: { updatePlacement: placementV2.operations.update },
  payload: { spec: primitives.json({ schema: SpecDocumentSchema }) },
});
```

Invalid history would surface the framework's `contract-payload-adapter-output-invalid` error with destination-version context. QRK can retain an explicit adapter if its bespoke error code is useful; the code is not required to preserve history or reject invalid destination values. A real payload conversion still needs an explicit adapter when identity cannot produce the intended destination value. Schema validation checks validity, not domain meaning or semantic reversibility. [Current custom mapping][spec-command-v2], [framework destination error][adapt-traversal].

The original command history remains stored when adaptation fails. No reset, schema weakening, silent empty-spec fallback, or historical payload rewrite is part of this change. Keeping the version lineage is still necessary; requiring callers to author a redundant forward identity is not. [Submitted-payload validation][submitted-payload], [execution error propagation][execution-errors], [adapter validation][adapt-traversal].

[sdk-evolution]: https://github.com/morgs32/zerospin/blob/23d09b78da39c589896f2a3abc8bf76be1c46061/packages/sdk/skills/zerospin-evolve-declarations/SKILL.md
[sdk-evolution-policy]: https://github.com/morgs32/zerospin/blob/23d09b78da39c589896f2a3abc8bf76be1c46061/packages/sdk/skills/zerospin-evolve-declarations/SKILL.md#L34-L39
[upgrade-api]: https://github.com/morgs32/zerospin/blob/23d09b78da39c589896f2a3abc8bf76be1c46061/packages/core/src/contracts/make/upgradeAggregateContractVersion.ts#L52-L116
[upgrade-generics]: https://github.com/morgs32/zerospin/blob/23d09b78da39c589896f2a3abc8bf76be1c46061/packages/core/src/contracts/make/upgradeAggregateContractVersion.ts#L28-L49
[upgrade-construction]: https://github.com/morgs32/zerospin/blob/23d09b78da39c589896f2a3abc8bf76be1c46061/packages/core/src/contracts/make/constructContractVersion.ts#L427-L515
[upgrade-required]: https://github.com/morgs32/zerospin/blob/23d09b78da39c589896f2a3abc8bf76be1c46061/packages/core/src/contracts/make/constructContractVersion.ts#L435-L456
[upgrade-patching]: https://github.com/morgs32/zerospin/blob/23d09b78da39c589896f2a3abc8bf76be1c46061/packages/core/src/contracts/make/constructContractVersion.ts#L457-L482
[upgrade-edge]: https://github.com/morgs32/zerospin/blob/23d09b78da39c589896f2a3abc8bf76be1c46061/packages/core/src/contracts/make/constructContractVersion.ts#L495-L514
[lineage-accessors]: https://github.com/morgs32/zerospin/blob/23d09b78da39c589896f2a3abc8bf76be1c46061/packages/core/src/contracts/make/constructContractVersion.ts#L298-L304
[construction-defaults]: https://github.com/morgs32/zerospin/blob/23d09b78da39c589896f2a3abc8bf76be1c46061/packages/core/src/contracts/make/constructContractVersion.ts#L333-L375
[decode-adapt]: https://github.com/morgs32/zerospin/blob/23d09b78da39c589896f2a3abc8bf76be1c46061/packages/core/src/contracts/decodeAndAdaptPayload/decodeAndAdaptPayload.ts#L64-L117
[adapt-source]: https://github.com/morgs32/zerospin/blob/23d09b78da39c589896f2a3abc8bf76be1c46061/packages/core/src/contracts/decodeAndAdaptPayload/adaptPayload/adaptPayload.ts#L47-L74
[adapt-traversal]: https://github.com/morgs32/zerospin/blob/23d09b78da39c589896f2a3abc8bf76be1c46061/packages/core/src/contracts/decodeAndAdaptPayload/adaptPayload/adaptPayload.ts#L75-L107
[execution-resolution]: https://github.com/morgs32/zerospin/blob/23d09b78da39c589896f2a3abc8bf76be1c46061/packages/system-worker/src/AggregateVersionRepo/utils/resolveAggregateExecution.ts#L64-L100
[owner-evaluation]: https://github.com/morgs32/zerospin/blob/23d09b78da39c589896f2a3abc8bf76be1c46061/packages/system-worker/src/AggregateVersionRepo/utils/evaluateAggregateCommand.ts#L24-L68
[evaluation]: https://github.com/morgs32/zerospin/blob/23d09b78da39c589896f2a3abc8bf76be1c46061/packages/core/src/contracts/evaluateContract.ts#L50-L95
[transaction-execution]: https://github.com/morgs32/zerospin/blob/23d09b78da39c589896f2a3abc8bf76be1c46061/packages/system-worker/src/AggregateVersionRepo/utils/executeAggregateCommandTx.ts#L38-L66
[execution-errors]: https://github.com/morgs32/zerospin/blob/23d09b78da39c589896f2a3abc8bf76be1c46061/packages/system-worker/src/AggregateVersionRepo/utils/executeAggregateCommandTx.ts#L104-L123
[operation-codecs]: https://github.com/morgs32/zerospin/blob/23d09b78da39c589896f2a3abc8bf76be1c46061/packages/core/src/contracts/operationCodecs.ts#L59-L72
[operation-identity]: https://github.com/morgs32/zerospin/blob/23d09b78da39c589896f2a3abc8bf76be1c46061/packages/core/src/contracts/operationCodecs.ts#L175-L185
[replay-model-binding]: https://github.com/morgs32/zerospin/blob/23d09b78da39c589896f2a3abc8bf76be1c46061/packages/core/src/contracts/prepareReplayAppliedOperation.ts#L65-L75
[admission]: https://github.com/morgs32/zerospin/blob/23d09b78da39c589896f2a3abc8bf76be1c46061/packages/system-worker/src/AggregateChain/admitAggregateCommands/validateNewAggregateCommand.ts#L58-L66
[submitted-payload]: https://github.com/morgs32/zerospin/blob/23d09b78da39c589896f2a3abc8bf76be1c46061/packages/system-worker/src/AggregateChain/admitAggregateCommands/validateSubmittedPayload.ts#L6-L18
[materialize]: https://github.com/morgs32/zerospin/blob/23d09b78da39c589896f2a3abc8bf76be1c46061/packages/system-worker/src/AggregateVersionRepo/materializeCommandTx.ts#L37-L54
[restore]: https://github.com/morgs32/zerospin/blob/23d09b78da39c589896f2a3abc8bf76be1c46061/packages/system-worker/src/AggregateVersionRepo/utils/restoreEvaluatedCommandTx.ts#L27-L61
[replay-original]: https://github.com/morgs32/zerospin/blob/23d09b78da39c589896f2a3abc8bf76be1c46061/packages/system-worker/src/AggregateVersionRepo/replayCommands/replayCommand.ts#L40-L50
[actor-upgrade-inference]: https://github.com/morgs32/zerospin/blob/23d09b78da39c589896f2a3abc8bf76be1c46061/packages/core/src/aggregateActor/updateAggregateActorVersion.ts#L46-L58
[actor-upgrade-construction]: https://github.com/morgs32/zerospin/blob/23d09b78da39c589896f2a3abc8bf76be1c46061/packages/core/src/aggregateActor/updateAggregateActorVersion.ts#L125-L155
[find-first]: https://github.com/morgs32/zerospin/blob/23d09b78da39c589896f2a3abc8bf76be1c46061/packages/core/src/contracts/findFirst.ts#L29-L32
[read-model-map]: https://github.com/morgs32/zerospin/blob/23d09b78da39c589896f2a3abc8bf76be1c46061/packages/core/src/contracts/make/makeContractReadDb.ts#L144-L151
[read-binding]: https://github.com/morgs32/zerospin/blob/23d09b78da39c589896f2a3abc8bf76be1c46061/packages/core/src/contracts/make/makeContractReadDb.ts#L259-L268
[complete-v1]: https://github.com/morgs32/qrk.sh/blob/61512d843921a5c4aaf34f72b98d07df4432c8f8/apps/zerospin/src/aggregates/user/contracts/brick/CompleteGithubRepoV1.ts#L17-L88
[complete-v1-reads]: https://github.com/morgs32/qrk.sh/blob/61512d843921a5c4aaf34f72b98d07df4432c8f8/apps/zerospin/src/aggregates/user/contracts/brick/CompleteGithubRepoV1.ts#L48-L84
[complete-v2]: https://github.com/morgs32/qrk.sh/blob/61512d843921a5c4aaf34f72b98d07df4432c8f8/apps/zerospin/src/aggregates/user/contracts/brick/CompleteGithubRepoV2.ts#L14-L79
[spec-filter]: https://github.com/morgs32/qrk.sh/blob/61512d843921a5c4aaf34f72b98d07df4432c8f8/apps/zerospin/src/modules/make/makePlacementModel.ts#L72-L99
[spec-command-v2]: https://github.com/morgs32/qrk.sh/blob/61512d843921a5c4aaf34f72b98d07df4432c8f8/apps/zerospin/src/aggregates/user/contracts/brick/UpdateGithubRepoSpecAtBreakpointV2.ts#L13-L29
[placement-v2]: https://github.com/morgs32/qrk.sh/blob/61512d843921a5c4aaf34f72b98d07df4432c8f8/apps/zerospin/src/aggregates/user/models/placement/PlacementV2.ts#L1-L11

[implemented-construction]: https://github.com/morgs32/zerospin/blob/c3b379b99d/packages/core/src/contracts/make/constructContractVersion.ts
[implemented-api]: https://github.com/morgs32/zerospin/blob/c3b379b99d/packages/core/src/contracts/make/upgradeAggregateContractVersion.ts
[implemented-types]: https://github.com/morgs32/zerospin/blob/c3b379b99d/packages/core/src/contracts/types.ts
[adopted-completion]: ../../apps/zerospin/src/aggregates/user/contracts/brick/CompleteGithubRepoV2.ts
[adopted-completion-v1]: ../../apps/zerospin/src/aggregates/user/contracts/brick/CompleteGithubRepoV1.ts
[adopted-spec]: ../../apps/zerospin/src/aggregates/user/contracts/brick/UpdateGithubRepoSpecAtBreakpointV2.ts
[adopted-update-brick]: ../../apps/zerospin/src/aggregates/user/contracts/brick/UpdateBrickV1.ts
