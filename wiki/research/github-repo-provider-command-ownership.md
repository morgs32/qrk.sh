# GitHub Repo: one public command, server-owned provider work

Researched 2026-10-21 from QRK source, installed Zerospin SDK 20.1.2, and the sibling Zerospin source/examples. This is a source review and proposal. No implementation changes, data operations, or verification runs were performed.

This architecture recommendation was superseded for QRK by the approved and implemented
[fetch-then-save plan](../archive/plans/037-plan-simple-provider-state-save.md).
The source findings below describe the earlier workflow.

## Conclusion

**QRK does not need two public commands for configuring a GitHub Repo brick.** One public `configureGithubRepo` command can record the intent, with the server fetching repository metadata and recording the result through a private continuation. The existing SDK supports that execution model. This conclusion follows from its ordinary-contract adapter and external-contract APIs, plus the existing aggregate tracking-label example. [Installed SDK guidance][sdk-external], [tracking adapter][tracking-adapter], [tracking continuation][tracking-external].

That does **not** mean the whole operation becomes one synchronous database execution. Starting the request and applying its later result are separate execution phases. It also does not mean the current SDK provides one declaration total: its documented composition uses a browser-safe ordinary declaration, a backend adapter for that declaration, and a separately registered external declaration containing the request and continuation. [SDK composition][sdk-reference], [external execution rules][contract-rules].

## What QRK does today

1. `configureGithubRepo` validates the URL, advances the Brick revision, and saves a `resolving` state. It does not schedule a Zerospin external operation. [Configure command][configure].
2. App observes resolving Bricks. `startGithubRepoResolution` coordinates browser work with an in-memory attempted set and `navigator.locks`, then calls `/rpc` to fetch the repository details. Disposal closes its active RPC sessions. [Browser resolution][browser-resolution].
3. The completion callback submits a second ordinary session command, `completeGithubRepo`, carrying the resulting state. Both commands are exposed in the browser session and web actor. [Session orchestration][session-work], [public session contracts][session-contracts], [actor contracts][actor-contracts].
4. The completion command checks the request, revision, URL, and state consistency before saving the supplied result. Those checks protect against stale results; the provider result still arrives as browser-submitted command payload. [Completion command][complete].

The API Worker performs the actual GitHub fetch using its configured token. Moving orchestration server-side should preserve a module-owned provider boundary and keep that token server-side; choosing the transport from the Zerospin Worker to that boundary remains implementation work. [Provider RPC][provider-rpc], [provider operation][provider-operation].

## Recommended ownership

Keep the existing public intent shape:

```ts
stageAggregateSessionCommand({
  session,
  contractName: "configureGithubRepo",
  payload: { brickId, url, requestId },
});
```

The proposed execution flow is:

```text
Browser submits configureGithubRepo
  → canonical server implementation records resolving state and external work
  → Zerospin runs the module's provider request
  → private continuation validates the current request/revision
  → continuation records ready data or a fetch failure
  → the existing live query updates the browser
```

This is a proposed QRK application of existing SDK capabilities. `makeAggregateContractAdapter` supplies the canonical server implementation for the public command. `makeAggregateExternalContract` supplies `external.request`, a response schema, and a continuation program receiving the recorded `externalOutcome`. The backend release registers the external declaration; it is not another ordinary command for the browser to submit. Ordinary admission rejects direct submission of external contracts, and session locks include ordinary public contracts only. [Installed SDK guidance][sdk-external], [ordinary admission][ordinary-admission], [session lock][session-lock].

The adapter must explicitly record the public command's checked model operations along with the external operation; the runtime does not append the public batch automatically. The existing tracking-label adapter demonstrates this distinction. [Tracking adapter][tracking-adapter], [SDK composition][sdk-reference].

Keep the current stale-result checks in the private continuation. Making work server-owned does not make an older response valid after a user changes the URL. Both the current QRK completion command and Zerospin's tracking continuation check the pending state before updating it. [Completion command][complete], [tracking continuation][tracking-external].

## Why the result still needs its own execution phase

Zerospin records pending external work with the originating command outcome, then runs the request outside SQL transactions and execution permits. Recording the response and admitting its continuation are atomic. Replay applies retained model effects without issuing the provider request again. A crash before recording a response can repeat a request; a recorded response is reused. These are runtime properties documented by the current source, not runtime results established by this research. [External execution rules][contract-rules], [external queue ownership][external-queue].

Consequently, making one ordinary command await HTTP inside its model transaction is not the supported simplification. The intended simplification is one public action whose later execution is owned by Zerospin. The caller observes domain state; originating command success alone does not establish provider success. [External execution rules][contract-rules], [SDK recovery semantics][sdk-reference].

## What is still an API ergonomics problem

The SDK already removes the need for a browser-side completion command, but currently requires multiple authored declarations to express the public command, canonical adapter, and private external work. If the desired authoring API is one declaration containing intent, request, and result handling, that needs a separate Zerospin API proposal. A QRK factory that hides those declarations would merely relocate the complexity. No such factory or new SDK API is proposed or implemented in this note. [Installed SDK guidance][sdk-external], [SDK composition][sdk-reference], [QRK simplicity rule][simplicity].

This provider-ownership problem is separate from the earlier proposal to inherit unchanged callbacks during contract upgrades. Callback inheritance would reduce repeated versioned code; it would not move provider work out of the browser. [Configure and completion bindings][session-work], [upgrade constructor][upgrade].

## Scope and limits

Recommendation only: no contract removal, actor capability change, provider move, SDK release, or migration was performed. Any adoption must account for retained command history and outstanding requests. Current source still contains the browser-owned flow described above. The research skill was executed directly because this side conversation prohibits sub-agents.

[configure]: ../../apps/zerospin/src/aggregates/user/contracts/brick/ConfigureGithubRepoV2.ts#L29-L86
[complete]: ../../apps/zerospin/src/aggregates/user/contracts/brick/CompleteGithubRepoV2.ts#L28-L79
[browser-resolution]: ../../apps/library/modules/githubRepo/startGithubRepoResolution.ts#L20-L143
[session-work]: ../../apps/app/zerospin/startLibrarySessionWork.ts#L53-L62
[session-contracts]: ../../apps/app/zerospin/userSessionDefinitionV4.ts
[actor-contracts]: ../../apps/zerospin/src/aggregates/user/actors/userActorV4.ts#L119-L120
[provider-rpc]: ../../apps/api/modules/LibraryApi.ts#L47-L50
[provider-operation]: ../../apps/api/modules/githubRepo/getGitHubRepo.ts#L9-L34
[sdk-external]: ../../apps/zerospin/node_modules/@zerospin/sdk/skills/zerospin-external-work/SKILL.md
[sdk-reference]: ../../apps/zerospin/node_modules/@zerospin/sdk/skills/zerospin-external-work/references/recorded-external-work.md
[tracking-adapter]: ../../../zerospin/examples/shopping/src/zerospin/aggregates/user/contracts/createTrackingLabelServerV1.ts#L12-L37
[tracking-external]: ../../../zerospin/examples/shopping/src/zerospin/aggregates/user/contracts/createExternalTrackingLabelV1.ts#L10-L85
[ordinary-admission]: ../../../zerospin/packages/system-worker/src/AggregateChain/admitAggregateCommands/validateNewAggregateCommand.ts#L33-L50
[session-lock]: ../../../zerospin/packages/core/src/aggregateSession/make/makeAggregateSessionLock.ts#L17-L28
[contract-rules]: ../../../zerospin/packages/core/src/contracts/README.md#L123-L181
[external-queue]: ../../../zerospin/packages/system-worker/src/externalOperations/README.md
[simplicity]: ../../AGENTS.md#L54
[upgrade]: ../../../zerospin/packages/core/src/contracts/make/upgradeAggregateContractVersion.ts
