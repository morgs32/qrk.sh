---
title: Blockchain
type: module
updated: 2026-07-28
sources:
  - path: packages/core/src/models/makeModel.ts
    sha: 651ff8ee8319c3eb98b20f2393c8b2fbc6ca3001
    lines: 186-964
  - path: packages/core/src/models/primitives.ts
    sha: 3c5996547248325822411a0f25e41487df82e498
    lines: 539-722
  - path: packages/core/src/drizzle/makeDbConfig.ts
    sha: 42e7e9838889d5535b03548a76489f364eef22c6
    lines: 13-60
  - path: packages/core/src/drizzle/makeDrizzleSchemas.ts
    sha: 7b9f236783a3ccfc3956b0cc7eb8f3562457ab28
    lines: 16-53
  - path: packages/core/src/drizzle/makeTableMigrationSQL.ts
    sha: 14dbaaefc2f96cca25e57737aaec1bdec7794232
    lines: 4-84
  - path: packages/core/src/drizzle/makeInMemorySqlJsDatabase.ts
    sha: 9bb417d8da941603c956150f074434647045cd08
    lines: 1-12
  - path: packages/core/src/drizzle/makeInMemorySQLite3.ts
    sha: 6893014732e11f4533f7310e0235c59d1feb1851
    lines: 1-25
  - path: packages/core/src/drizzle/makeDrizzleRelations.ts
    sha: 92be7906f8a1cc8d34e952c041e1f6056528d11a
    lines: 19-379
  - path: packages/core/src/utils/coreAbbreviations.ts
    sha: 09f1c75ac7c25c3813d8d171f6c42e0f7a9e12a2
    lines: 1-15
  - path: packages/core/src/models/makeServiceModel.ts
    sha: 1946ceaaf532d5cbd65b13a5ef4be6551f2e8b5e
    lines: 1-120
  - path: packages/core/src/service/makeServiceController.ts
    sha: 2d910b6875fe5a2d7560e0cf3c3fca259047ac26
    lines: 97-554
  - path: packages/core/src/actorController/makeActorController.ts
    sha: 85b8c448f66bfb4800975285079cdb6f89dc245d
    lines: 87-213
  - path: packages/core/src/models/makeSelection.ts
    sha: bff426e08a4ccead881115f13d69af9239658c23
    lines: 280-466
  - path: examples/shopping/src/zerospin/models.ts
    sha: 760f7e7bd785a6f93e827803f37da74a8222547a
    lines: 5-65
  - path: examples/shopping/src/zerospin/system.ts
    sha: 5c976e776cbf472d0c94e606fb9590627f07166a
    lines: 33-68
  - path: packages/core/src/contracts/applyAccountMutationTx.ts
    sha: f474ce742db1388a7774ce64ddbb49289f1c8219
    lines: 10-91
  - path: packages/core/src/contracts/applyFrontendMutationTx.ts
    sha: b85cf3c002a882ee10f703f3782091d073e4cd30
    lines: 14-111
  - path: packages/core/src/contracts/applyMutationInverseTx.ts
    sha: 828899f6837870f8e1e55833c021cfa563d02236
    lines: 1-303
  - path: packages/core/src/contracts/types.ts
    sha: 78f8862dbebb54ac49721f137581cf2961f1220d
    lines: 250-321
  - path: packages/core/src/contracts/CommandSchema.ts
    sha: 1e465fbd9c9da6520934c07f16272d8d97884126
    lines: 155-162
  - path: packages/core/src/contracts/assertMutationsUseModels.ts
    sha: 35d910653ccf5eba6f8da07f7c2cdb734ac516f6
    lines: 29-69
  - path: packages/core/src/contracts/applyMutationTx.ts
    sha: 2ad9af5b221bcb336520d308f0642f2c69164abb
    lines: 1-344
  - path: packages/core/src/contracts/commitAppliedMutationTx.ts
    sha: 58516332f9b15a05e752c84af3a6d7dad464a9d0
    lines: 1-332
  - path: packages/core/src/models/EncodedResourceSchema.ts
    sha: 7eccf697153144bc0493b30bac80da5f4a0914da
    lines: 1-19
  - path: packages/core/src/session/types.ts
    sha: 7198ef0e0cf4f350e51ec075d8ce8e75a1ecc2d6
    lines: 68-212
  - path: packages/core/src/session/FrontendBlockSchema.ts
    sha: 1e89909f0ae513bf51d05deb2de18cbcee20fe0f
    lines: 17-180
  - path: packages/core/src/session/applyFrontendBlock.ts
    sha: 155bb05395e92601de35e194ee4a9a213211b5f9
    lines: 43-892
  - path: packages/core/src/session/makeSession.ts
    sha: 226dd97453a95cc22ebb5bd542de3d306eb945cd
    lines: 190-447
  - path: packages/system-worker/src/AccountRepo/finalizeAccountBlock/prepareAccountCommands.ts
    sha: 56c9896d7032db01dee1c0a9d2f9d860158302cb
    lines: 33-393
  - path: packages/system-worker/src/AccountRepo/finalizeAccountBlock/finalizeCommandsTx.ts
    sha: 84224ed5d24ce59ddc7279c19d29f88d3dd4fc5e
    lines: 40-319
  - path: packages/system-worker/src/AccountRepo/finalizeAccountBlock/finalizeAccountBlock.ts
    sha: 7884500e2efa0127bfee09c14bc9fe675cb9677a
    lines: 42-70
  - path: packages/system-worker/src/AccountRepo/finalizePushedCommands/finalizePushedCommands.ts
    sha: 0a69fe8aaaabd32b9665c9a2056087d0e61cdb95
    lines: 83-615
  - path: packages/system-worker/src/ServiceRepo/finalizeServiceCommands/finalizeServiceCommands.ts
    sha: fdb0343437e08018f8486dbb33975d41384bbc1e
    lines: 34-306
  - path: packages/system-worker/src/ServiceRepo/drainServiceBlockOutbox/drainServiceBlockOutbox.ts
    sha: c054653ea7259d2e27958d6f53054af29e5a01e1
    lines: 20-76
  - path: packages/system-worker/src/ServiceBlockRepo/ServiceBlockRepo.ts
    sha: 8b196f8e385d4d13b1faaf3702eb34420316933b
    lines: 29-336
  - path: packages/system-worker/src/ServiceBlockRepo/drainAccountSubscribers/drainAccountSubscribers.ts
    sha: 08fea7e354210ef9bfa022467396fa52e6e4263a
    lines: 18-131
  - path: packages/system-worker/src/ServiceBlockRepo/drainGeneration/drainGeneration.ts
    sha: a5a801c9a915b17a6bc9e840e8fa67596451784c
    lines: 11-222
  - path: packages/system-worker/src/AccountRepo/handleServiceBlocks/handleServiceBlocks.ts
    sha: 56e6d22f03cccdf9d3f5d7d6362f385693b70d92
    lines: 21-171
  - path: packages/system-worker/src/AccountRepo/drainAccountOutboxes/drainAccountOutboxes.ts
    sha: 10c4c6d60e99bbf4b76bdfcb2a92d34c6a35e9c5
    lines: 25-148
  - path: packages/system-worker/src/AccountRepo/AccountRepo.ts
    sha: 4f4aa1d9b55e102e83f28dbc857335b8d0f24e46
    lines: 103-469
  - path: packages/system-worker/src/ServiceRepo/getReplicatedResources/getReplicatedResources.ts
    sha: 1224e23f6f234aa02e3254caaf92cdc07fd4d62c
    lines: 22-217
  - path: packages/system-worker/src/ActorRepo/handleAccountBlocks/handleAccountBlocks.ts
    sha: 2f91abf665f9a13d1fe82a9782bdc9e76002699e
    lines: 62-230
  - path: packages/system-worker/src/ActorRepo/ActorRepo.ts
    sha: 66370625f844977d826e68d0c828ce6fac2e7fb9
    lines: 130-137
  - path: packages/system-worker/src/AccountBlockRepo/AccountBlockRepo.ts
    sha: 284ad1570ca65895c5e1aec25fc9b38be27c5710
    lines: 49-277
  - path: packages/system-worker/src/AccountBlockRepo/accountBlockDrizzleSchemas.ts
    sha: e6a81cc8432b0dc81679da214fade68e12309a7b
    lines: 184-214
  - path: packages/system-worker/src/AccountBlockRepo/publish/publish.ts
    sha: da7263c9a86a66cf81c67be158e2db9af23ae0ec
    lines: 90-96
  - path: packages/system-worker/src/AccountBlockRepo/drainActorOutbox/drainActorOutbox.ts
    sha: 05516472e02e24cc09d47b06fdb79b48a3c2c256
    lines: 11-207
  - path: packages/system-worker/src/AccountBlockRepo/processSubscriber/processSubscriber.ts
    sha: 9e380bff2b474b5a43ef315fdbc84c892480ea68
    lines: 122-190
  - path: packages/system-worker/src/AccountBlockRepo/alarm/alarm.ts
    sha: 16f4f0af32b2bb184b63309a170b10d32b19e2ce
    lines: 9-36
  - path: packages/logger/src/makeRpcHandler.ts
    sha: c140ba2cfd2c8f5718600463402cfd2baf423a46
    lines: 11-75
  - path: packages/logger/src/makeTraceableRpcTarget.ts
    sha: 1c816b656fcea502d71b52643c0c78abc9856f34
    lines: 13-113
  - path: packages/logger/src/makeTraceableApiTarget.ts
    sha: f701a5c5168f0ddb9c8d6ba87eb164eb87e66d34
    lines: 40-122
  - path: packages/system-worker/src/ActorBlockRepo/ActorBlockRepo.ts
    sha: 97caae103e3856575f969c47bb4ccde0b11686ce
    lines: 78-192
  - path: packages/system-worker/src/ActorBlockRepo/drainFrontendSubscribers/drainFrontendSubscribers.ts
    sha: 614f6e05ebce315126e2eb2e4697869a4b935a1e
    lines: 12-145
  - path: packages/system-worker/src/FrontendRepo/FrontendRepo.ts
    sha: 9312c62b6e61dffb65c85912fc1bd4a958e27409
    lines: 41-500
  - path: packages/system-worker/src/FrontendRepo/drainGeneration/drainGeneration.ts
    sha: 4170f1e5f3a09d720fd85984fc50f753b02db835
    lines: 11-90
  - path: packages/system-worker/src/FrontendRepo/bootstrap/bootstrap.ts
    sha: d4775f040e29354824fa318036d5bcbdec9ac03c
    lines: 23-123
  - path: packages/system-worker/src/FrontendRepo/handleActorBlocks/handleActorBlocks.ts
    sha: 151bd7037510505684502ee58b6557c1e7a1472d
    lines: 95-531
  - path: packages/system-worker/src/FrontendRepo/pushCommands/pushCommands.ts
    sha: 219761e375d690f03e31aefc585f2ff9d19a7e50
    lines: 75-471
  - path: packages/system-worker/src/FrontendRepo/drainPushedBlockOutbox/drainPushedBlockOutbox.ts
    sha: 50d247819e91ff5887d0d32e2550eeee1b117f51
    lines: 33-129
  - path: packages/system-worker/src/FrontendRepo/getFrontendState/getFrontendState.ts
    sha: 2505a7aaa93c6ffe993531759cc82338665fefbd
    lines: 47-381
  - path: packages/system-worker/src/FrontendRepo/drainFrontendBlockOutbox/drainFrontendBlockOutbox.ts
    sha: f9f70c4994716a54602551dcafcbd3757e50ed2f
    lines: 17-80
  - path: packages/system-worker/src/FrontendBlockRepo/FrontendBlockRepo.ts
    sha: 7e3127e2df4ce291e97f9d4ea49f0a8781e2fa16
    lines: 20-270
  - path: packages/system-worker/src/FrontendBlockRepo/storeFrontendBlocks/storeFrontendBlocks.ts
    sha: d5fc5e101c16f048b1b9f6569e6d7672a833b8e5
    lines: 10-280
  - path: packages/system-worker/src/SystemWorker.ts
    sha: 86ec0244f0688ea6dd2bc4d97bda74a8ce055a16
    lines: 282-2814
  - path: packages/system-worker/src/makeDurableDb.ts
    sha: d992bea35148f50ee8ca7fadaa966ca8c011c4a0
    lines: 1-20
  - path: packages/system-worker/src/SystemRepo/SystemRepo.ts
    sha: 8d571d959494ca8a39510f20bb0ed1d1079613e2
    lines: 252-710
  - path: packages/system-worker/src/makeRepo/makeRepoNameUtils.ts
    sha: 91b16507aa924ce42db97b7e1666fa3b015ea9e8
    lines: 33-79
  - path: packages/dispatch-worker/src/SystemApi/SystemApi.ts
    sha: c54223d45368499b2b347073e43e2560c0361ea8
    lines: 72-282
  - path: examples/shopping/e2e/system.e2e.spec.ts
    sha: 9a0beb1b82abcc2444665b1688f6d66c922ab612
    lines: 25-199
  - path: packages/system-worker/src/types.ts
    sha: 9346bac82cc92c94713ace366066bdd787ad848e
    lines: 117-164
  - path: packages/react/src/acquireFrontendWebSocket.ts
    sha: af08d68747ba61629b37af6e0c12057c44cf42b3
    lines: 62-877
  - path: packages/system-worker/src/createFrontendWebSocketTicket/createFrontendWebSocketTicket.ts
    sha: e412e8734eb3e77a19930016f10516ed148e3521
    lines: 25-418
  - path: packages/system-worker/src/createServiceFrontendWebSocketTicket/createServiceFrontendWebSocketTicket.ts
    sha: 7c5d036a67378072550af1a57d7afa0611b89e32
    lines: 28-452
  - path: packages/frontend/src/pushStagedCommands.ts
    sha: 77fba7e4cf486c810f20058efb9b74333e2b686c
    lines: 44-105
  - path: packages/dispatch-worker/src/FrontendApi/FrontendApi.ts
    sha: 975dc13fa5ed087305560787b0d55e060301856a
    lines: 167-431
  - path: packages/dispatch-worker/src/Worker.ts
    sha: f65a437ebbc271f9f00bdfb01b4cb725c6374d9f
    lines: 21-92
  - path: examples/shopping/src/zerospin/contracts.ts
    sha: fcbe7d457ac53fc213c79655fdc3d200d2513db3
    lines: 98-123
  - path: packages/core/src/accountController/makeAccountController.ts
    sha: 86f3b5b284b2ef79a5b818e4a67e926ce15d8362
    lines: 228-523
  - path: packages/core/src/contracts/makeContract.ts
    sha: 7b0e69ef1da04f1d5bf8d82bbfd319104779bc19
    lines: 91-166
  - path: packages/core/src/contracts/makeMutations.ts
    sha: 387f29b456a3777bb75078cb0efee0e4cde1987c
    lines: 10-64
  - path: packages/core/src/contracts/replayAppliedMutationTx.ts
    sha: a5d5df3b4625ac10d6a18d600b3afeca0b7114da
    lines: 33-397
  - path: packages/system-worker/src/AccountBlockRepo/getReplayBound/getReplayBound.ts
    sha: eb8dab1fcfb04a5f034d6999080592fffe52551b
    lines: 9-53
  - path: packages/system-worker/src/AccountRepo/replayAccountBlock/replayAccountBlock.ts
    sha: 085546462164e01bfff25c6ec85e6a089f1ac616
    lines: 85-437
  - path: packages/system-worker/src/AuthorizationRepo/AuthorizationRepo.ts
    sha: 66a1273138de8f1b64bebf0ef635d0ec6ee804f0
    lines: 79-84
  - path: packages/system-worker/src/ServiceBlockRepo/getReplayBound/getReplayBound.ts
    sha: 3ee3bace5144945392d8967b5499868acf70b0ab
    lines: 9-53
  - path: packages/system-worker/src/ServiceRepo/ServiceRepo.ts
    sha: d4d791840bd9d00942a9f9c3db19209602b7ce67
    lines: 191-196
  - path: packages/system-worker/src/ServiceRepo/replayServiceBlock/replayServiceBlock.ts
    sha: 4c97366d37a646cc3243e3802e9c2e383f31ec71
    lines: 27-353
  - path: packages/system-worker/src/SystemLogRepo/SystemLogRepo.ts
    sha: c859a25a69a74421459fe2f9cc36b3b0b7d05d6b
    lines: 263-279
  - path: packages/system-worker/src/SystemLogRepo/appendTelemetryBatch/appendTelemetryBatch.ts
    sha: a67304fe51e10a0880fcf2069ad10db27976610c
    lines: 21-154
  - path: packages/system-worker/src/SystemRepo/drainGeneration/drainGeneration.ts
    sha: 6976de7c19ea26659199baa289d688973128066c
    lines: 39-1689
  - path: packages/system-worker/src/SystemRepo/prepareGeneration/prepareGeneration.ts
    sha: f397bf94edc70075ee9799c0b243cf28170bb226
    lines: 91-1870
  - path: packages/system-worker/src/makeRepo/makeRepo.ts
    sha: ca625f09c80f8fba40d7b35d19011e91105f54a5
    lines: 180-207
  - path: packages/system-worker/src/prepareGeneration/prepareGeneration.ts
    sha: e866d63b61bf8adfa6584c7501178d37b222d725
    lines: 17-92
  - path: packages/system-worker/src/ServiceBlockRepo/drainServiceFrontendSubscribers/drainServiceFrontendSubscribers.ts
    sha: fdb084437e04cc54c9fab033ef0c54b888eff8b5
    lines: 15-275
  - path: packages/system-worker/src/ServiceFrontendRepo/handleServiceBlocks/handleServiceBlocks.ts
    sha: a01cf052cd60bc1a19ce4a4ca2c2d737c65cf769
    lines: 18-298
  - path: packages/system-worker/src/systemWorkerAbbreviations.ts
    sha: 4cdddf0eb7a82a031365fd701eed9df145b2e69e
    lines: 1-17
  - path: packages/system-worker/src/ServiceFrontendRepo/ServiceFrontendRepo.ts
    sha: 365b12f0ef26b8a27aabf6a209b2d84035ca3741
    lines: 95-334
  - path: packages/system-worker/src/ServiceFrontendBlockRepo/ServiceFrontendBlockRepo.ts
    sha: 0c7aff28b20709526ff7825b74726de91473e113
    lines: 143-329
  - path: packages/core/src/serviceSession/types.ts
    sha: fb75ac2e4d3403492656f4ef66b5245af49eb60f
    lines: 16-104
  - path: packages/core/src/serviceSession/ServiceFrontendBlockSchema.ts
    sha: 6030e7a47e3f51d660784bfb4bb7b65e40b57911
    lines: 20-112
  - path: packages/system-worker/src/ServiceFrontendBlockRepo/storeServiceFrontendBlocks/storeServiceFrontendBlocks.ts
    sha: 4a371e26ec1ab5a14c8e576f5c8846bd13d9ffc6
    lines: 13-286
  - path: packages/system-worker/src/FrontendBlockRepo/onMessage/onMessage.ts
    sha: 4c123a504431c4eb63b68400b209c6b882f7dfa5
    lines: 19-377
  - path: packages/system-worker/src/ServiceFrontendBlockRepo/onMessage/onMessage.ts
    sha: dc3e51a8e39ebfd5284791e0f2f50e2b74a9a7ec
    lines: 19-371
  - path: packages/react/src/acquireServiceFrontendWebSocket.ts
    sha: 672893661d59941da2e047707f13b4bb9d5a299f
    lines: 85-903
  - path: packages/shared-worker/src/SharedWorker/partitionSchemas.ts
    sha: 6a67722b0d866bfd019f7363612b5df4d571f030
    lines: 181-464
  - path: packages/shared-worker/src/SharedWorker/makeSharedWorkerHost.ts
    sha: 491f7e4055485cd66fe9ff63449190be2fcba395
    lines: 825-9200
  - path: packages/system-worker/src/SystemRepo/resolveFrontendProjectionLineage/resolveFrontendProjectionLineage.ts
    sha: 2ddbda8d656f64bd4c205dbfa3e34cfa6ce4f92f
    lines: 161-640
  - path: packages/system-worker/src/ServiceFrontendRepo/getFrontendState/getFrontendState.ts
    sha: d2577f0318c280ca03103ab99dcf37562c282adf
    lines: 139-672
  - path: packages/system-worker/src/ServiceFrontendRepo/prepareSuccessor/prepareSuccessor.ts
    sha: 77e32719456329012493e2441ef95ae1c9d9c474
    lines: 333-394
  - path: packages/system-worker/src/SystemRepo/registerRepos/registerRepos.ts
    sha: 69f44b23cf83526b55752a361f5bd0ee0d1fb54f
    lines: 12-54
---

# Blockchain

Zerospin has account and service authoritative ledgers plus two distinct browser
projection chains. Service blocks continue to subscribed AccountRepos as before,
and independently fan out to actor-specific read-only service frontend
projections:

1. Account changes flow `AccountRepo` → `AccountBlockRepo` → `ActorRepo` →
   `ActorBlockRepo` → `FrontendRepo`.
2. Service changes flow `ServiceRepo` → the singleton `ServiceBlockRepo` for
   that service → every subscribed `AccountRepo` → `AccountBlockRepo` and the
   same actor chain.
3. The same singleton ServiceBlockRepo separately delivers relevant blocks to
   `ServiceFrontendRepo`, which materializes only the bound service actor's
   declared models and archives target-bound lineage blocks in
   `ServiceFrontendBlockRepo`. Irrelevant service blocks advance only the source
   watermark and emit no frontend block
   (../../packages/system-worker/src/ServiceBlockRepo/drainServiceFrontendSubscribers/drainServiceFrontendSubscribers.ts:15-275,
   ../../packages/system-worker/src/ServiceFrontendRepo/handleServiceBlocks/handleServiceBlocks.ts:18-298).
4. Frontend pushes flow `Browser session` → `FrontendApi` → `FrontendRepo`, where admission updates an optimistic frontend projection and creates an immutable pushed block; FrontendRepo then drains that block to `AccountRepo.finalizePushedCommands` (../../packages/dispatch-worker/src/FrontendApi/FrontendApi.ts:167-199, ../../packages/dispatch-worker/src/FrontendApi/FrontendApi.ts:400-423, ../../packages/system-worker/src/FrontendRepo/pushCommands/pushCommands.ts:301-471, ../../packages/system-worker/src/FrontendRepo/drainPushedBlockOutbox/drainPushedBlockOutbox.ts:33-129).
5. `FrontendRepo` receives authoritative convergence only from ActorBlockRepo delivery, converts actor deltas into one monotonic logical `frontendIndex`, then publishes account lineage blocks through its one-to-one `FrontendBlockRepo` websocket/archive (../../packages/system-worker/src/FrontendRepo/FrontendRepo.ts:166-187,
   ../../packages/system-worker/src/FrontendBlockRepo/FrontendBlockRepo.ts:20-76).

AccountRepo owns canonical service replicas, including retained deleted rows,
and one subscription watermark per service. The service-model table itself is
the replication record; no separate membership or deletion registry exists.
FrontendRepo has no service subscription, service watermark, or separate
replicated-resource registry (../../packages/system-worker/src/AccountRepo/AccountRepo.ts:140-175,
../../packages/system-worker/src/FrontendRepo/FrontendRepo.ts:62-116).

## Replica chain

```mermaid
flowchart LR
  subgraph AccountChain["Account-owned chain"]
    AR["AccountRepo authoritative finalization"] --> ABR["AccountBlockRepo"]
    ABR --> XR["ActorRepo"]
    XR --> XBR["ActorBlockRepo"]
  end

  subgraph ServiceChain["Service-owned chain"]
    SR["ServiceRepo finalizeServiceCommands"] --> SBR["ServiceBlockRepo singleton per service"]
    SBR --> SFR["ServiceFrontendRepo actor-specific projection"]
    SFR --> SFBR["ServiceFrontendBlockRepo lineage archive"]
  end

  subgraph FrontendAdmission["Frontend-owned admission"]
    Session["Browser session"] --> FA["FrontendApi pushCommands"]
    FA --> FR["FrontendRepo optimistic state and pushed block outbox"]
  end

  SBR --> AR
  FR -->|"finalizePushedCommands"| AR
  XBR --> FR
  FR --> FBR["FrontendBlockRepo one actor and frontend"]
  FBR --> WS["Browser websocket"]
  SFBR --> SWS["Read-only service browser websocket"]
  WS --> Session
  SWS --> Session
```

Every Durable Object database belongs to one explicit data lineage. The locked
names are `sysrepo_{generationId}`,
`acctrepo_{generationId}/{accountId}/{accountName}`,
`atzrepo_{generationId}/{accountId}/{accountName}`,
`actrrepo_{generationId}/{accountId}/{accountName}/{actorName}/{actorId}`,
`frtrepo_{generationId}/{accountId}/{accountName}/{actorName}/{actorId}/{frontendName}`,
`svcrepo_{generationId}/{serviceName}`,
`acctbrepo_{generationId}/{accountId}/{accountName}`,
`actrbrepo_{generationId}/{accountId}/{accountName}/{actorName}/{actorId}`,
`frtbrepo_{generationId}/{accountId}/{accountName}/{actorName}/{actorId}/{frontendName}`,
`svcbrepo_{generationId}/{serviceName}`,
`svcfrtrepo_{generationId}/{serviceName}/{actorName}/{actorId}/{frontendName}`,
`svcfrtbrepo_{generationId}/{serviceName}/{actorName}/{actorId}/{frontendName}`,
and `syslogrepo_{generationId}`. The account and service projection archives
therefore have different target identities even though both use a monotonic
`frontendIndex`
(../../packages/system-worker/src/systemWorkerAbbreviations.ts:1-17,
../../packages/system-worker/src/ServiceFrontendRepo/ServiceFrontendRepo.ts:164-190,
../../packages/system-worker/src/ServiceFrontendBlockRepo/ServiceFrontendBlockRepo.ts:143-153).
`makeRepoNameUtils` rejects a missing or wrong exact prefix before matching the
route. `makeRepo` auto-registers only repositories whose `repoUtils` declares a
`repoType`, using the `generationId` parsed from that repository's own name so
reading a predecessor during replay cannot register the source into the target
SystemRepo. Account `FrontendRepo`, `ServiceFrontendRepo`, and
`ServiceFrontendBlockRepo` deliberately omit automatic registration. A live
account projection registers explicitly only after lineage, archive, and
subscriber setup; a snapshot-only `no-local-segment` never registers. Service
projection state and archive repositories become discoverable together through
one transactional `SystemRepo.registerRepos` call only after catch-up and
archive coverage are ready
(../../packages/core/src/utils/coreAbbreviations.ts:1-15,
../../packages/system-worker/src/makeRepo/makeRepoNameUtils.ts:33-79,
../../packages/system-worker/src/makeRepo/makeRepo.ts:180-207,
../../packages/system-worker/src/FrontendRepo/FrontendRepo.ts:221-244,
../../packages/system-worker/src/FrontendRepo/getFrontendState/getFrontendState.ts:148-179,
../../packages/system-worker/src/FrontendRepo/getFrontendState/getFrontendState.ts:292-330,
../../packages/system-worker/src/ServiceFrontendRepo/ServiceFrontendRepo.ts:162-202,
../../packages/system-worker/src/ServiceFrontendBlockRepo/ServiceFrontendBlockRepo.ts:146-171,
../../packages/system-worker/src/ServiceFrontendRepo/getFrontendState/getFrontendState.ts:623-672,
../../packages/system-worker/src/ServiceFrontendRepo/prepareSuccessor/prepareSuccessor.ts:333-393,
../../packages/system-worker/src/SystemRepo/registerRepos/registerRepos.ts:12-54).

## Telemetry continuity

The account-finalize request trace starts with a caller-owned root. `makeTraceableApiTarget` captures that root and sends its identity in the linked SystemApi request; `SystemApi.finalizeAccountCommands` runs as a separate server root, while its inner `makeTraceableRpcTarget` / `makeRpcHandler` calls merge the SystemWorker and AccountRepo child telemetry into that server batch (../../packages/logger/src/makeTraceableApiTarget.ts:40-122, ../../packages/dispatch-worker/src/SystemApi/SystemApi.ts:218-282, ../../packages/logger/src/makeTraceableRpcTarget.ts:13-113, ../../packages/logger/src/makeRpcHandler.ts:11-75).

After account finalization settles, the common SystemApi boundary completes and flushes the server root, persists that batch through the same unwrapped SystemWorker stub used by the leaf, and can return a server-owned `causedBy` link pointing to the caller span. Persistence failure preserves the finalization result and returns `link: null` (../../packages/dispatch-worker/src/SystemApi/SystemApi.ts:72-154).

```mermaid
sequenceDiagram
  participant Caller as caller root
  participant SystemApi
  participant SystemWorker
  participant AccountRepo
  participant AccountBlockRepo
  participant ActorRepo
  participant Alarm as AccountBlockRepo alarm
  participant SystemLogRepo

  Caller->>SystemApi: linked finalizeAccountCommands request
  Note over SystemApi: start SystemApi.finalizeAccountCommands server root
  SystemApi->>SystemWorker: traceable finalizeAccountBlock
  SystemWorker->>AccountRepo: finalizeAccountBlock
  AccountRepo->>AccountBlockRepo: publish
  AccountBlockRepo-->>AccountRepo: block stored + RPC telemetry
  AccountRepo-->>SystemWorker: finalized block + RPC telemetry
  SystemWorker-->>SystemApi: result + merged request telemetry
  SystemApi->>SystemWorker: appendTelemetryBatch
  SystemWorker->>SystemLogRepo: persist completed request trace for generationId
  SystemApi-->>Caller: full finalization result + causedBy link

  Note over AccountBlockRepo: waitUntil starts a new drain root
  AccountBlockRepo->>ActorRepo: handleAccountBlocks
  alt delivery succeeds
    ActorRepo-->>AccountBlockRepo: success + telemetry
  else delivery fails
    ActorRepo-->>AccountBlockRepo: encoded domain error + telemetry
    Note over AccountBlockRepo: persist retryOf span and earliest retry deadline
    Alarm->>ActorRepo: retry handleAccountBlocks
    ActorRepo-->>Alarm: success + telemetry
  end
  AccountBlockRepo->>SystemLogRepo: persist drain/alarm trace for generationId
```

The shopping SystemApi e2e uses one explicit HTTP-batch session per sequential leaf, keeps two caller roots and their returned links, reads persisted SystemLogRepo span rows through separate raw public RepoExplorer sessions, and checks the cross-store relationship: each link's owned `traceId`/`spanId` identifies the completed server root, while its prior ids identify the originating caller span (../../examples/shopping/e2e/system.e2e.spec.ts:25-199).

`AccountBlockRepo.publish` stores only the completed publish span identity needed to link the separate `waitUntil` drain root with `kind: causedBy`. The drain reads and removes that durable context best-effort, captures the current Effect runtime once, and uses it for the existing concurrent queue so refresh and subscriber Effects retain the drain span without a raw context argument (../../packages/system-worker/src/AccountBlockRepo/publish/publish.ts:90-96, ../../packages/system-worker/src/AccountBlockRepo/drainActorOutbox/drainActorOutbox.ts:11-66, ../../packages/system-worker/src/AccountBlockRepo/drainActorOutbox/drainActorOutbox.ts:68-181).

Failed ActorRepo delivery stores the failing span identity as `retryOf`, records the subscriber's next retry deadline, and returns that deadline to the queue. The queue schedules the earliest deadline across the completed concurrent wave; the alarm consumes the stored identity and links its new root before re-entering the same drain Effect (../../packages/system-worker/src/AccountBlockRepo/processSubscriber/processSubscriber.ts:138-190, ../../packages/system-worker/src/AccountBlockRepo/drainActorOutbox/drainActorOutbox.ts:124-207, ../../packages/system-worker/src/AccountBlockRepo/alarm/alarm.ts:9-36). Request, drain, and alarm collectors flush separately into the generation-scoped SystemLogRepo; stable record ids make retries idempotent and retention deletes span, log, and link rows for traces beyond the newest 1,000 (../../packages/dispatch-worker/src/SystemApi/SystemApi.ts:72-154, ../../packages/system-worker/src/SystemWorker.ts:391-433, ../../packages/system-worker/src/AccountBlockRepo/AccountBlockRepo.ts:153-203, ../../packages/system-worker/src/AccountBlockRepo/AccountBlockRepo.ts:223-277, ../../packages/system-worker/src/SystemLogRepo/appendTelemetryBatch/appendTelemetryBatch.ts:21-154).

## Block and delta types

1. `IAccountBlock` is the canonical account batch: it carries nullable `pushedBlockId`, executed and failed command unions, encoded applied mutations, `lastAccountCursor`, and `accountIndex`. A pushed transaction stores full `IExecutedPushedCommand` or `IFailedPushedCommand` outcomes; ordinary account and service-origin blocks use `pushedBlockId: null` (../../packages/system-worker/src/types.ts:117-136, ../../packages/system-worker/src/AccountRepo/finalizeAccountBlock/finalizeAccountBlock.ts:42-70, ../../packages/system-worker/src/AccountRepo/handleServiceBlocks/handleServiceBlocks.ts:144-162).
2. `IActorBlock` adds actor-selection deltas without replacing any account-block provenance or command outcomes. ActorRepo applies the account block and spreads it unchanged into its actor-block outbox record, so `pushedBlockId` and full terminal pushed commands continue downstream (../../packages/system-worker/src/types.ts:151-164, ../../packages/system-worker/src/ActorRepo/handleAccountBlocks/handleAccountBlocks.ts:156-177).
3. `IServiceBlock` is one finalized ServiceRepo command batch with executed and
   failed commands, applied mutations, `lastServiceCursor`, and
   `serviceIndex` (../../packages/system-worker/src/types.ts:140-147,
   ../../packages/system-worker/src/ServiceRepo/finalizeServiceCommands/finalizeServiceCommands.ts:202-248).
4. `IPushedBlock` is one FrontendRepo-assigned `pblk_*` containing a session id, a required nullable `admissionLastAccountCursor`, and full encoded pushed commands. `null` represents the initial account frontier. `IPushedCommand` retains the frontend payload/version, command type, staged cursor/time, and adds pushed time/cursor (../../packages/core/src/contracts/types.ts:250-321, ../../packages/core/src/contracts/CommandSchema.ts:155-162).
5. `IFrontendBlock` is the account-browser convergence payload. Its delta has
   ordinary `inserted`, `updated`, and `deleted` entries plus the complete
   pending pushed snapshot, pushed terminal outcomes, and
   `lastRebasedPushedCursor`. `IFrontendLineageBlock` wraps that payload with
   the exact account/actor/frontend identity or carries an explicit
   generation-boundary receipt. The SharedWorker commits server and local
   command changes to one contiguous `replicaIndex` through
   `IFrontendReplicaBlock`
   (../../packages/core/src/session/types.ts:68-212,
   ../../packages/core/src/session/FrontendBlockSchema.ts:31-180).
6. `IServiceFrontendBlock` is a separate read-only service-browser payload. It
   carries the service/actor/frontend identity, the source service cursor, and
   only ordinary resource deltas—never account pending, pushed, or terminal
   command state. Its lineage boundary, replica state, replica block, and
   transition-required control all preserve the same exact service target and
   give the worker a separate contiguous `replicaIndex`
   (../../packages/core/src/serviceSession/types.ts:16-104,
   ../../packages/core/src/serviceSession/ServiceFrontendBlockSchema.ts:20-112).
7. `frontendIndex` is the logical lineage index archived by the server. A
   worker `replicaIndex` is the physical local commit sequence. Generation
   boundaries consume a frontend index even when successor catch-up emits no
   resource block, so resume can distinguish a fully applied predecessor from
   a required lineage transition
   (../../packages/core/src/session/types.ts:109-212,
   ../../packages/core/src/serviceSession/types.ts:35-104).

## Client-safe service models and actor selections

`makeServiceModel` is a client-safe model factory: it calls `makeModel`, adds an
enumerable immutable `serviceName`, and imports no server-only marker. The
server-only `makeServiceController` accepts only service models whose ownership
matches its controller name and rejects plain or wrong-service models at
runtime (../../packages/core/src/models/makeServiceModel.ts:1-39,
../../packages/core/src/service/makeServiceController.ts:97-153).

Actor controllers declare an explicit complete `models` registry. The type and
runtime checks require one selection per model, under the same key, referencing
the exact same model object (../../packages/core/src/actorController/makeActorController.ts:87-213).
Selection compilation receives that full registry, supports both forward refs
and inverse relation names, and starts from a distinct root selection so
inverse-many joins cannot duplicate root resources
(../../packages/core/src/models/makeSelection.ts:280-381,
../../packages/core/src/models/makeSelection.ts:388-466).

`makeModel` now owns and exposes the concrete table containing its synthesized
primary-key `id` and declared attributes. A model ref names that table plus
mandatory forward and inverse relation names; `makeDbConfig({ tables })` and
`makeResourceDbConfig` derive schema and Drizzle relations from the same table
graph. `primitives.self` resolves a relation to the current table before config
construction; cross-table ref cycles remain invalid. Every ref becomes a
forward `one`; a unique ref produces an inverse `one`, while a non-unique ref
produces an inverse `many`
(../../packages/core/src/models/makeModel.ts:186-305,
../../packages/core/src/models/primitives.ts:539-722,
../../packages/core/src/drizzle/makeDbConfig.ts:13-60,
../../packages/core/src/drizzle/makeDrizzleRelations.ts:19-379).

Shopping declares models in dependency order: Cart references `User.table`, and
CartItem references `Cart.table` and `Product.table`. The Product selection can
therefore walk the derived inverse `cartItems` relation through Cart and User,
so only Products referenced by active actor CartItems enter the actor graph
(../../examples/shopping/src/zerospin/models.ts:5-65,
../../examples/shopping/src/zerospin/system.ts:33-68).

## SemVer model history and model-owned mutations

`makeModel` accepts one complete current definition and an array of complete
historical definitions. Every definition carries the same `modelName` and
abbreviation plus its own SemVer, complete attributes, and indexes. Construction
rejects an invalid SemVer, a historical identity mismatch, and duplicate
versions; the historical array is definition data, not a migration chain.
`makeModel` supplies explicit framework metadata through
`makeModelAndMetadata`; `makeServiceModel` supplies the same metadata plus its
nullable `deletedAt` deletion marker before attaching the immutable service
owner (../../packages/core/src/models/makeModel.ts:230-340,
../../packages/core/src/models/makeServiceModel.ts:22-120).

## Persisted reference enforcement

Every persisted `primitives.ref` is both a Drizzle relation and an immediate
SQLite foreign key. Database configuration combines resource-model and other
tables into one graph, records each logical table identity, and resolves lazy
Drizzle reference closures against that graph. Migration SQL preserves
column-level primary-key, autoincrement, not-null, unique, and default
constraints before emitting concrete `FOREIGN KEY (...) REFERENCES ... (...)`
clauses and configured indexes. Foreign keys have no cascade, set-null, or
deferred options, leaving SQLite's default `NO ACTION` behavior
(../../packages/core/src/drizzle/makeDbConfig.ts:26-60,
../../packages/core/src/drizzle/makeDrizzleSchemas.ts:16-53,
../../packages/core/src/drizzle/makeTableMigrationSQL.ts:7-36,
../../packages/core/src/drizzle/makeTableMigrationSQL.ts:39-75).

Every database-opening boundary explicitly enables `PRAGMA foreign_keys = ON`
before transactions begin. A create, update, delete, move, or replicated-row
write that violates a reference becomes
`mutation-referential-integrity-failed` with model, resource, and operation
context; inverse replay maps the same write failure instead of exposing a raw
SQLite defect (../../packages/core/src/drizzle/makeInMemorySqlJsDatabase.ts:7-12,
../../packages/core/src/drizzle/makeInMemorySQLite3.ts:18-25,
../../packages/system-worker/src/makeDurableDb.ts:11-20,
../../packages/core/src/contracts/applyMutationTx.ts:93-118,
../../packages/core/src/contracts/applyMutationInverseTx.ts:27-303).

The returned model owns both sides of every versioned mutation operation:
`createMutation(version)` / `create(version, props)`,
`updateMutation(version)` / `update(version, props)`,
`deleteMutation(version)` / `delete(version, props)`,
`moveMutation(version)` / `move(version, props)`, and, for service models,
`replicateResourceMutation(version)` / `replicateResource(version, props)`.
Every method rejects a version absent from the current or historical definition
set. The schema side encodes `modelName`, `modelVersion`, `operationName`,
`resourceId`, and the version-specific operation shape; the constructor side
returns the decoded mutation bound to that exact model definition
(../../packages/core/src/models/makeModel.ts:363-838).

## Contract-declared mutation shapes and order

Every contract declares `mutations` as an Effect Schema or `null`. A schema
requires a program whose Effect result has that exact shape; `null` forbids a
program and supplies the internal empty result. Contracts do not carry
historical definitions or payload adapters (../../packages/core/src/contracts/makeContract.ts:91-166).

`makeMutations` validates the payload, runs the program once, validates its
complete result against the declared schema, and flattens only at this boundary.
`Schema.Tuple` and `Schema.Array` retain array order; `Schema.Struct` retains
declaration/property order; a single mutation becomes one element; and
`mutations: null` becomes an empty mutation list. Ownership validation runs only
after that ordered flattening (../../packages/core/src/contracts/makeMutations.ts:10-64).

Shopping's `addToCart` demonstrates a structural declaration whose order is
part of the command: the CartItem create mutation precedes the Product replica
mutation, and the program returns the matching keyed Effect result
(../../examples/shopping/src/zerospin/contracts.ts:98-123).

## Controller-owned direct mutation adapters

Account controllers own mutation adapters for account models; service
controllers own adapters for service models, including `replicateResource`.
Each `mutationAdapters[modelName][operationName]` entry is an array of direct
historical-source edges. A non-null edge must name a current destination schema
for the same operation and provide a requirement-free Effect callback. A
`destination: null` edge omits the callback and deliberately retires that
historical mutation. Destinations cannot point to historical versions, so
adapter chains are not followed
(../../packages/core/src/accountController/makeAccountController.ts:228-496,
../../packages/core/src/service/makeServiceController.ts:240-514).

Removing a model requires exhaustive retirement coverage rather than dropping
its table definition alone. An account model must cover `create`, `update`,
`delete`, and `move` for the same historical version set; a service model must
also cover `replicateResource`. Every edge may adapt into a current model or
explicitly discard to `null`
(../../packages/core/src/accountController/makeAccountController.ts:499-523,
../../packages/core/src/service/makeServiceController.ts:517-554).

```mermaid
flowchart TD
  Stored["Stored applied mutation<br/>modelName + modelVersion + operationName"]
  Current{"Decodes under same-name<br/>current mutation schema?"}
  Retag["Bind current model and modelVersion"]
  Edge{"Exactly one direct controller edge<br/>for source version?"}
  Null{"destination is null?"}
  Discard["Discard this mutation"]
  Adapt["Decode historical source<br/>run adapter<br/>validate current destination"]
  Apply["Apply at original timestamp<br/>recompute target inverse<br/>encode target mutation"]

  Stored --> Current
  Current -->|yes| Retag --> Apply
  Current -->|no| Edge
  Edge -->|no| Fail["Fail generation preparation"]
  Edge -->|yes| Null
  Null -->|yes| Discard
  Null -->|no| Adapt --> Apply
```

During generation replay, `replayAppliedMutationTx` first attempts the automatic
same-name current-schema promotion. Incompatible or renamed mutations must
match exactly one direct source edge. A null destination returns no target
mutation; a non-null adapter result is validated before application. The target
application preserves the source command id, mutation index, and timestamp but
recomputes inverse state from the new generation's rows
(../../packages/core/src/contracts/replayAppliedMutationTx.ts:33-174,
../../packages/core/src/contracts/replayAppliedMutationTx.ts:176-397).

## Model-owned `replicateResource`

`ServiceModel.replicateResource(version, { resource })` validates the complete
resource against that model version and verifies both `modelName` and resource
version. Its matching `replicateResourceMutation(version)` schema carries the
whole resource, derived `serviceName`, model identity, version, operation, and
resource id. There is no release operation
(../../packages/core/src/models/makeModel.ts:698-838).

The same mutation has runtime-specific write behavior:

1. Browser sessions and FrontendRepo use
   [`applyFrontendMutationTx`](../../packages/core/src/contracts/applyFrontendMutationTx.ts).
   It immediately upserts the complete resource and captures the prior complete
   row for optimistic rollback (../../packages/core/src/contracts/applyFrontendMutationTx.ts:14-111).
2. AccountRepo and ActorRepo use
   [`applyAccountMutationTx`](../../packages/core/src/contracts/applyAccountMutationTx.ts).
   It upserts the complete canonical service row into the account/actor model
   table while preserving applied-mutation metadata
   (../../packages/core/src/contracts/applyAccountMutationTx.ts:10-91).
3. Authoritative service changes reach the browser as ordinary actor-selected
   inserted or updated rows; a service delete is an update carrying
   `deletedAt`. A failed optimistic command still
   restores or deletes its previous local replica through the saved inverse
   (../../packages/core/src/session/applyFrontendBlock.ts:607-797,
   ../../packages/core/src/contracts/applyMutationInverseTx.ts:20-92).

AccountRepo has no per-resource registry or watermark. A service-model row joins
replication when a canonical snapshot is inserted. An authoritative service
delete retains that row with `deletedAt`, and ActorRepo, FrontendRepo, and the
session receive the retained resource through the ordinary updated-resource
path. ActorRepo and FrontendRepo store the rows selected into their graphs
(../../packages/system-worker/src/AccountRepo/AccountRepo.ts:140-175,
../../packages/system-worker/src/AccountRepo/handleServiceBlocks/handleServiceBlocks.ts:105-171,
../../packages/system-worker/src/ActorRepo/handleAccountBlocks/handleAccountBlocks.ts:84-153).

## Model-owned delete mutations

`Model.deleteMutation(version)` and `Model.delete(version, { resourceId })`
remain the single encoded/decoded delete operation. Ownership is the ordinary
mutation rule enforced by
`assertMutationsUseModels`: service contracts delete their own service models,
account contracts delete plain account models, and an account contract emitting
delete for a service model is rejected
(../../packages/core/src/models/makeModel.ts:557-622,
../../packages/core/src/contracts/assertMutationsUseModels.ts:29-69).

For a plain model, delete still physically removes the row. For a service model,
the same delete preserves every attribute and sets both `deletedAt` and
`updatedAt` to the mutation's `appliedAt`. The applied mutation still stores the
complete prior resource as its `{ resource }` inverse
(../../packages/core/src/contracts/applyMutationTx.ts:48-119,
../../packages/core/src/contracts/applyMutationInverseTx.ts:1-303).

Deletion is terminal. An exact same-timestamp service-delete replay succeeds as
a no-op; a differently timestamped delete, create, update, move, or replication
against the deleted id fails with `service-resource-deleted`. ServiceRepo also
returns that failure instead of a live canonical row for new replication
(../../packages/core/src/contracts/applyMutationTx.ts:48-80,
../../packages/core/src/contracts/applyMutationTx.ts:121-331,
../../packages/core/src/contracts/commitAppliedMutationTx.ts:40-320,
../../packages/system-worker/src/ServiceRepo/getReplicatedResources/getReplicatedResources.ts:122-172).

When AccountRepo applies a relevant service delete, it retains the same row and
advances the service subscription watermark. Downstream projections therefore
carry one identical deletion timestamp without transforming the encoded delete
mutation or its inverse
(../../packages/system-worker/src/AccountRepo/handleServiceBlocks/handleServiceBlocks.ts:105-171,
../../packages/core/src/contracts/commitAppliedMutationTx.ts:40-320).

Queries receive no implicit `deletedAt` predicate. A service query can return a
deleted row unless its caller explicitly excludes it.

## Account validation and canonical replacement

[`prepareAccountCommands`](../../packages/system-worker/src/AccountRepo/finalizeAccountBlock/prepareAccountCommands.ts)
runs before the AccountRepo SQLite transaction. It verifies ownership, groups
replication refs by exact `serviceRepoName`, reads each persisted subscription
watermark, and issues one concurrent `getReplicatedResources` request per
service. ServiceRepo returns the requested rows in request order together with
the retained ServiceBlock suffix and one cursor/index watermark from the same
SQLite transaction; preparation maps missing or failed results back to their
owning commands and replaces successful client seeds with decoded canonical
rows
(../../packages/system-worker/src/AccountRepo/finalizeAccountBlock/prepareAccountCommands.ts:33-393,
../../packages/system-worker/src/ServiceRepo/getReplicatedResources/getReplicatedResources.ts:22-217).

Both ordinary and pushed finalization run grouped snapshot preparation and the
local AccountRepo transaction inside one coarse `blockConcurrencyWhile` gate,
so a queued `handleServiceBlocks` delivery cannot advance the subscription
between reading C and committing W. Outbox subscription and publication drain
only after the gate releases
(../../packages/system-worker/src/AccountRepo/AccountRepo.ts:331-469).

If the service, model, resource, or resource schema is invalid, that command's
prepared mutations are `Either.Left`; `finalizeCommandsTx` emits a failed
account command and performs no mutation writes for it. Before applying each
successful canonical mutation, the transaction advances an existing service
projection through the returned block suffix, emits commandless AccountBlocks
for relevant retained blocks, and inserts or updates the exact-name service
subscription at the snapshot watermark. Successful commands retain the full
command and full canonical replication mutation in the final account block
(../../packages/system-worker/src/AccountRepo/finalizeAccountBlock/prepareAccountCommands.ts:279-393,
../../packages/system-worker/src/AccountRepo/finalizeAccountBlock/finalizeCommandsTx.ts:40-239,
../../packages/system-worker/src/AccountRepo/finalizeAccountBlock/finalizeCommandsTx.ts:241-313).

Ordinary AccountRepo and ServiceRepo commands apply inside one savepoint per
command. A referential-integrity or terminal-deletion failure rolls back every
mutation from that command, records the normal failed command, and leaves later
sibling commands eligible to execute; pushed-command savepoints are unchanged
(../../packages/system-worker/src/AccountRepo/finalizeAccountBlock/finalizeCommandsTx.ts:242-313,
../../packages/system-worker/src/ServiceRepo/finalizeServiceCommands/finalizeServiceCommands.ts:101-230).

## Account and actor delivery

```mermaid
sequenceDiagram
  participant Session as Browser session
  participant FrontendApi
  participant SystemWorker
  participant FrontendRepo
  participant AccountRepo
  participant AccountBlockRepo
  participant ActorRepo
  participant ActorBlockRepo
  participant FrontendBlockRepo

  Session->>FrontendApi: pushCommands(full staged commands)
  FrontendApi->>SystemWorker: pushCommands(bound scope)
  SystemWorker->>FrontendRepo: pushCommands
  FrontendRepo->>FrontendRepo: capture admissionLastAccountCursor
  FrontendRepo->>FrontendRepo: admit guards and optimistic mutations
  FrontendRepo-->>Session: pending + pushed + failed
  FrontendRepo->>AccountRepo: finalizePushedCommands(pushed block)
  AccountRepo->>AccountRepo: return duplicate outcome before cursor work
  AccountRepo->>AccountRepo: adapt, prepare, and align retained ServiceBlocks
  AccountRepo->>AccountRepo: compare post-alignment cursor with admission cursor
  alt cursors match
    AccountRepo->>AccountRepo: trust prior frontend guard results
  else cursors differ
    AccountRepo->>AccountRepo: rerun original guards sequentially in savepoints
  end
  AccountRepo->>AccountRepo: apply authoritative mutations and record outcomes
  AccountRepo->>AccountRepo: drain subscriptions and account block outbox
  AccountRepo->>AccountBlockRepo: publish pure account block in accountIndex order
  AccountBlockRepo->>ActorRepo: handleAccountBlocks ordered suffix
  ActorRepo->>ActorRepo: apply finalized rows and compute selection deltas
  ActorRepo->>ActorBlockRepo: storeActorBlocks pure actor blocks
  ActorBlockRepo->>FrontendRepo: handleActorBlocks ordered suffix
  FrontendRepo->>FrontendRepo: rewind pending, apply authoritative, replay pending
  FrontendRepo->>FrontendBlockRepo: convergence block + pushed watermark
  FrontendBlockRepo-->>Session: websocket block
```

ActorRepo commits every registered actor model mutation, including complete
service replicas, recomputes every selection using the actor's full model
registry, stores pure actor blocks in its outbox, and publishes them to
ActorBlockRepo
(../../packages/system-worker/src/ActorRepo/handleAccountBlocks/handleAccountBlocks.ts:62-230).

ActorBlockRepo stores each actor block once and identifies each subscriber by
its exact prefixed `frontendRepoName`, while keeping `frontendName` separately.
The drain calls `FRONTEND_REPO.getByName(frontendRepoName)` directly, advances
the subscriber watermark on success, and on failure persists retry state plus
the exact future deadline used to retain the earliest alarm across wake and
resume (../../packages/system-worker/src/ActorBlockRepo/ActorBlockRepo.ts:78-124,
../../packages/system-worker/src/ActorBlockRepo/drainFrontendSubscribers/drainFrontendSubscribers.ts:25-199).

FrontendRepo bootstrap snapshots the frontend binding's selected actor models, including selected service-model rows and graph refs, records ActorRepo's account cursor/index, initializes its frontend index, and subscribes itself to ActorBlockRepo from that watermark. Pushed state is not imported from ActorRepo because FrontendRepo owns it (../../packages/system-worker/src/FrontendRepo/bootstrap/bootstrap.ts:23-123, ../../packages/system-worker/src/FrontendRepo/FrontendRepo.ts:80-123).

`handleActorBlocks` first rewinds every pending pushed mutation in reverse pushed/mutation order, applies the authoritative actor deltas and encoded mutations, removes terminal pushed commands, and deletes a matching pushed-block outbox row. It then rebuilds optimistic state by replaying remaining commands in pushed order, each inside a savepoint. A failed server-side optimistic replay silently removes that pending command, records an annotated warning, and does not invent an authoritative failure outcome. After the transaction, any replay-warning batch is appended best-effort to the generation-scoped SystemLogRepo (../../packages/system-worker/src/FrontendRepo/handleActorBlocks/handleActorBlocks.ts:95-288, ../../packages/system-worker/src/FrontendRepo/handleActorBlocks/handleActorBlocks.ts:290-384, ../../packages/system-worker/src/FrontendRepo/handleActorBlocks/handleActorBlocks.ts:509-531).

After terminal cleanup, FrontendRepo advances each affected session's terminal staged cursor to the processed cursor when no open pushed block remains. It emits one idempotent convergence block containing the final optimistic rows/deletes for every affected reference, the complete pending snapshot, terminal pushed outcomes, and the current pushed watermark (../../packages/system-worker/src/FrontendRepo/handleActorBlocks/handleActorBlocks.ts:386-418, ../../packages/system-worker/src/FrontendRepo/handleActorBlocks/handleActorBlocks.ts:420-505).

## Service delivery

```mermaid
sequenceDiagram
  participant Caller
  participant ServiceRepo
  participant ServiceBlockRepo
  participant AccountRepo
  participant AccountBlockRepo
  participant ServiceFrontendRepo

  Caller->>ServiceRepo: finalizeServiceCommands batch
  ServiceRepo->>ServiceRepo: tx apply commands and write one serviceBlockOutbox row
  ServiceRepo->>ServiceBlockRepo: publish one IServiceBlock
  ServiceBlockRepo->>ServiceBlockRepo: archive by serviceIndex
  loop each subscribed AccountRepo
    ServiceBlockRepo->>AccountRepo: handleServiceBlocks ordered suffix
    AccountRepo->>AccountRepo: apply mutations for existing rows and advance watermark
    AccountRepo->>AccountBlockRepo: publish one commandless block when relevant
  end
  loop each subscribed ServiceFrontendRepo
    ServiceBlockRepo->>ServiceFrontendRepo: handleServiceBlocks ordered suffix
    ServiceFrontendRepo->>ServiceFrontendRepo: apply selected resources and advance watermark
  end
```

ServiceRepo assigns one service cursor/index per command, applies all successful
service-owned mutations, records command failures, builds one `IServiceBlock`
for the whole finalization batch, and writes the service resource changes,
cursors, and block outbox atomically
(../../packages/system-worker/src/ServiceRepo/finalizeServiceCommands/finalizeServiceCommands.ts:34-260).

`drainServiceBlockOutbox` publishes pending rows in service-index order to the
single ServiceBlockRepo named by `{ generationId, serviceName }`, records
publish failures durably, and uses a Durable Object alarm for retry
(../../packages/system-worker/src/ServiceRepo/drainServiceBlockOutbox/drainServiceBlockOutbox.ts:20-76).

ServiceBlockRepo remains the only durable subscriber-delivery queue for both
account and service-frontend subscribers. The
grouped replication snapshot reads retained blocks from ServiceRepo's source
outbox in `(C, W]`; it does not consume, acknowledge, or replace the
ServiceBlockRepo delivery path
(../../packages/system-worker/src/ServiceRepo/getReplicatedResources/getReplicatedResources.ts:71-196,
../../packages/system-worker/src/ServiceBlockRepo/ServiceBlockRepo.ts:29-130).

ServiceBlockRepo archives every service block and retains exact prefixed repo
names for both subscriber classes. Account delivery calls
`ACCOUNT_REPO.getByName(accountRepoName)` directly; service-frontend delivery
calls `SERVICE_FRONTEND_REPO.getByName(serviceFrontendRepoName)` directly. Each
path advances its service cursor/index on success and persists retry state plus
the exact earliest future alarm deadline on failure
(../../packages/system-worker/src/ServiceBlockRepo/ServiceBlockRepo.ts:29-130,
../../packages/system-worker/src/ServiceBlockRepo/drainAccountSubscribers/drainAccountSubscribers.ts:18-131,
../../packages/system-worker/src/ServiceBlockRepo/drainServiceFrontendSubscribers/drainServiceFrontendSubscribers.ts:15-275).

AccountRepo likewise identifies each service subscription by the exact
prefixed `serviceRepoName` while retaining `serviceName` as a separate routing
invariant. AccountBlockRepo identifies actor subscribers by exact
`actorRepoName`, and its delivery boundary passes that stored name directly to
`ACTOR_REPO.getByName`
(../../packages/system-worker/src/AccountRepo/AccountRepo.ts:140-198,
../../packages/system-worker/src/AccountRepo/handleServiceBlocks/handleServiceBlocks.ts:21-80,
../../packages/system-worker/src/AccountBlockRepo/accountBlockDrizzleSchemas.ts:184-214,
../../packages/system-worker/src/AccountBlockRepo/processSubscriber/processSubscriber.ts:122-185).

AccountRepo processes blocks explicitly by `serviceIndex`, applies mutations
only when the addressed service-model row already exists, and advances the one
service subscription watermark even when every mutation is irrelevant. A
relevant ServiceBlock enqueues one AccountBlock with a fresh account
cursor/index and empty executed/failed command arrays; a service delete updates
the retained row with its deletion marker
(../../packages/system-worker/src/AccountRepo/handleServiceBlocks/handleServiceBlocks.ts:72-171).

`drainAccountOutboxes` retries pending account subscriptions, then publishes
pending AccountBlocks strictly by `accountIndex`. It records publication state,
stops after the first block failure, and schedules the AccountRepo alarm for
retry; account finalization, service handling, and `alarm` all invoke this drain
(../../packages/system-worker/src/AccountRepo/drainAccountOutboxes/drainAccountOutboxes.ts:25-148,
../../packages/system-worker/src/AccountRepo/AccountRepo.ts:352-435).

## Generation ledger replay and watermarks

A migrated generation is rebuilt from the predecessor's immutable service and
account block ledgers, not by re-running historical contract programs. Drain is
two phase. `mode: 'freeze'` atomically changes admission from `open` to
`draining`, waits only for the finite set of already committed write
reservations, drains every dependency level, and persists immutable owner-ledger
and projection bounds plus `drainFrozenAt`. It does not mark the source
`drained`. A reservation that remains for 30 seconds is reported as abandoned
and is retained for diagnosis rather than silently expired
(../../packages/system-worker/src/SystemRepo/drainGeneration/drainGeneration.ts:39-117,
../../packages/system-worker/src/SystemRepo/drainGeneration/drainGeneration.ts:384-585,
../../packages/system-worker/src/SystemRepo/drainGeneration/drainGeneration.ts:587-834,
../../packages/system-worker/src/SystemRepo/drainGeneration/drainGeneration.ts:836-1689).

Hosted predecessor code may finish its retry/outbox work during that dependency
walk. A self-hosted upload cannot execute predecessor behavior, so repo drain
boundaries perform inspection only and fail if any old work remains.
`ServiceBlockRepo` checks both its account and service-frontend subscriber
watermarks against the terminal service block. The narrow retired
actor/frontend FrontendRepo seam is limited to an already-bootstrapped
self-hosted repo and retained account models; it does not make new invalid repo
keys or removed accounts inspectable
(../../packages/system-worker/src/ServiceBlockRepo/drainGeneration/drainGeneration.ts:11-220,
../../packages/system-worker/src/FrontendRepo/FrontendRepo.ts:223-274,
../../packages/system-worker/src/FrontendRepo/drainGeneration/drainGeneration.ts:11-90).

A projection first resolved after `drainFrozenAt` is a snapshot-only
`no-local-segment`. It materializes readable owner state at the nearest real
predecessor bound but creates no subscriber, local archive, registration, or
ticket path and therefore does not extend the finite frozen projection set.
Only a pre-freeze reservation becomes a live physical segment and successor
handoff input
(../../packages/system-worker/src/SystemRepo/resolveFrontendProjectionLineage/resolveFrontendProjectionLineage.ts:161-275,
../../packages/system-worker/src/SystemRepo/resolveFrontendProjectionLineage/resolveFrontendProjectionLineage.ts:278-408,
../../packages/system-worker/src/SystemRepo/resolveFrontendProjectionLineage/resolveFrontendProjectionLineage.ts:589-640,
../../packages/system-worker/src/FrontendRepo/getFrontendState/getFrontendState.ts:139-179,
../../packages/system-worker/src/ServiceFrontendRepo/getFrontendState/getFrontendState.ts:239-364).

Migration preparation requires that ready, draining, frozen predecessor. It
replays authoritative service ledgers first and account ledgers second, then
prepares every frozen account and service frontend projection against the
already replayed target owners. Each successor projection catches up in
`no-emission` mode, records its predecessor archive, emits exactly one
generation-boundary lineage block, and becomes live. Only after candidate
opening and routing promotion does `mode: 'complete'` mark the predecessor
drained, purge both kinds of unused websocket ticket, and close predecessor
archive rooms with a superseded signal
(../../packages/system-worker/src/SystemRepo/prepareGeneration/prepareGeneration.ts:469-541,
../../packages/system-worker/src/SystemRepo/prepareGeneration/prepareGeneration.ts:1325-1731,
../../packages/system-worker/src/SystemRepo/drainGeneration/drainGeneration.ts:176-381).

```mermaid
sequenceDiagram
  participant Caller as deployment coordinator
  participant Worker as candidate SystemWorker
  participant TargetSystem as target SystemRepo
  participant SourceSystem as predecessor SystemRepo
  participant SourceServiceLedger as predecessor ServiceBlockRepo
  participant TargetService as target ServiceRepo
  participant TargetServiceLedger as target ServiceBlockRepo
  participant SourceAccountLedger as predecessor AccountBlockRepo
  participant TargetAccount as target AccountRepo
  participant TargetAccountLedger as target AccountBlockRepo

  Caller->>Worker: prepareGeneration(deployId, generationId, prevGenerationId, systemSpec, seeds=[])
  Worker->>TargetSystem: prepareGeneration
  TargetSystem->>SourceSystem: require ready + draining + frozen; read immutable bounds
  loop each source ServiceRepo, then each serviceIndex through captured bound
    TargetSystem->>SourceServiceLedger: getReplayBlock(after, through)
    TargetSystem->>TargetService: replayServiceBlock(full source block)
    TargetService->>TargetService: adapt or discard stored mutations; preserve commands and watermark
    TargetService->>TargetServiceLedger: publish exact target block
    TargetServiceLedger-->>TargetService: verify serviceIndex + lastServiceCursor
  end
  loop each source AccountRepo, then each accountIndex through captured bound
    TargetSystem->>SourceAccountLedger: getReplayBlock(after, through)
    TargetSystem->>TargetAccount: replayAccountBlock(full source block)
    TargetAccount->>TargetAccount: adapt or discard stored mutations; preserve commands and watermark
    TargetAccount->>TargetAccountLedger: publish exact target block
    TargetAccountLedger-->>TargetAccount: verify accountIndex + lastAccountCursor
  end
  TargetSystem->>TargetAccount: restore each service subscription cursor/index
  loop each frozen account frontend projection
    TargetSystem->>TargetSystem: install target-owner snapshot without emission
    TargetSystem->>TargetSystem: archive one account generation boundary; become live
  end
  loop each frozen service frontend projection
    TargetSystem->>TargetSystem: install target ServiceRepo snapshot without emission
    TargetSystem->>TargetSystem: archive one service generation boundary; become live
  end
  TargetSystem->>TargetSystem: verify source/target owner-repo counts; mark ready
  TargetSystem-->>Worker: readiness = ready
  Worker-->>Caller: prepared identity
```

Service ledgers replay first, one source ServiceRepo and one strictly ascending
block at a time through its captured service bound. Every target ServiceRepo is
instantiated even when its source ledger is empty. Each replay receipt is keyed
to the deploy, predecessor, source index, and cursor; publication is blocking,
and the target ServiceBlockRepo must contain the exact terminal watermark before
the repo completion is stored
(../../packages/system-worker/src/SystemRepo/prepareGeneration/prepareGeneration.ts:544-857,
../../packages/system-worker/src/ServiceRepo/replayServiceBlock/replayServiceBlock.ts:27-198,
../../packages/system-worker/src/ServiceRepo/replayServiceBlock/replayServiceBlock.ts:200-353).

Account ledgers replay only after all service completions. Account mutation
ownership remains split: service-origin and replica mutations use the owning
service controller's adapters; account mutations use the account controller.
The target block spreads the complete source block and replaces only its
adapted applied-mutation array, preserving full encoded commands, pushed-block
provenance, cursor/index, and timestamps. Each replay then publishes and verifies
the exact target AccountBlockRepo block
(../../packages/system-worker/src/SystemRepo/prepareGeneration/prepareGeneration.ts:859-1132,
../../packages/system-worker/src/AccountRepo/replayAccountBlock/replayAccountBlock.ts:85-194,
../../packages/system-worker/src/AccountRepo/replayAccountBlock/replayAccountBlock.ts:195-370,
../../packages/system-worker/src/AccountRepo/replayAccountBlock/replayAccountBlock.ts:375-437).

After one account ledger reaches its bound, preparation copies each source
service subscription's exact `currentServiceCursor` and `currentServiceIndex`
into the target AccountRepo, but only after proving that watermark is not beyond
the captured service-ledger bound. This preserves the account's position in the
service chain. Frozen account projection receipts then install successor state
from the replayed target account owner and frozen service projection receipts
install successor state from the replayed target ServiceRepo; neither copies a
predecessor projection database as the new authority. Both preserve archive
lineage through an explicit boundary. Preparation finally requires equal
source/target ServiceRepo and AccountRepo counts before committing target
readiness
(../../packages/system-worker/src/SystemRepo/prepareGeneration/prepareGeneration.ts:1134-1323,
../../packages/system-worker/src/SystemRepo/prepareGeneration/prepareGeneration.ts:1325-1731,
../../packages/system-worker/src/SystemRepo/prepareGeneration/prepareGeneration.ts:1733-1790).

## Generation replay trigger

1. [`SystemWorker.prepareGeneration`](../../packages/system-worker/src/prepareGeneration/prepareGeneration.ts) receives the candidate `deployId`, target `generationId`, nullable `prevGenerationId`, complete `systemSpec`, and seeds.
   1. It delegates to the target generation's SystemRepo and returns only an exact `{ deployId, generationId, readiness: 'ready' }` result (../../packages/system-worker/src/prepareGeneration/prepareGeneration.ts:17-80).
2. Preparation is blocking but is not activation. It builds or validates a closed target lineage; opening generation admission happens later.

## Annotated generation replay steps

1. [`SystemRepo.prepareGeneration`](../../packages/system-worker/src/SystemRepo/prepareGeneration/prepareGeneration.ts) verifies that the supplied SystemSpec encodes identically to the candidate Worker's runtime system and establishes exclusive preparation ownership (../../packages/system-worker/src/SystemRepo/prepareGeneration/prepareGeneration.ts:91-214).
2. A compatible reuse has `prevGenerationId: null`, no seeds, and no ledger replay. It rechecks compatibility against the generation's active SystemSpec and records the candidate as the preparing deploy (../../packages/system-worker/src/SystemRepo/prepareGeneration/prepareGeneration.ts:216-320).
3. A detached initial or clean generation has `prevGenerationId: null`; its ordered seeds run through ordinary account/service finalization so it begins with normal authoritative ledgers (../../packages/system-worker/src/SystemRepo/prepareGeneration/prepareGeneration.ts:341-468).
4. A migration has a non-null predecessor, forbids seeds, and requires the
   predecessor to be ready, `draining`, and frozen with an active SystemSpec.
   It must actually require a new generation and have complete adapter coverage
   (../../packages/system-worker/src/SystemRepo/prepareGeneration/prepareGeneration.ts:469-541).
5. Services replay to their captured bounds before accounts. Every target block is published and verified, and per-repo completion rows make a same-deploy retry idempotent (../../packages/system-worker/src/SystemRepo/prepareGeneration/prepareGeneration.ts:544-857).
6. Accounts then replay to their bounds, restore exact service-subscription watermarks, and store verified per-repo completions (../../packages/system-worker/src/SystemRepo/prepareGeneration/prepareGeneration.ts:859-1283).
7. Every account and service projection named by a frozen drain receipt is
   prepared at its exact causal and logical watermark, backed by an exactly
   matching archive descriptor, and advanced through one boundary before
   target readiness
   (../../packages/system-worker/src/SystemRepo/prepareGeneration/prepareGeneration.ts:1325-1731).
8. Readiness commits only after clean seeding or all migration postconditions.
   Any failure permanently marks the target generation `failed` and keeps
   admission closed
   (../../packages/system-worker/src/SystemRepo/prepareGeneration/prepareGeneration.ts:1733-1870).

## Pushed commands and optimistic replication

Browser staging runs the frontend contract immediately with frontend models.
In direct mode, the session applies each mutation optimistically and persists
its inverse before any network request. In SharedWorker mode, the session sends
the complete encoded command and unapplied mutations with its current replica
index to the worker; the worker checks that causal base, durably journals and
materializes the command, and fans the resulting replica block back. A
causal-behind stale-base response waits for the missing replica index and then
reruns the complete contract preparation, while repair, update, release, and
non-stale failures remain terminal
(../../packages/core/src/session/makeSession.ts:190-447,
../../packages/shared-worker/src/SharedWorker/makeSharedWorkerHost.ts:3884-4265,
../../packages/shared-worker/src/SharedWorker/makeSharedWorkerHost.ts:7648-7723).

For nonempty direct-mode staging, the browser obtains a signature from the session and sends the full encoded staged rows through one linked `FrontendApi.pushCommands` call. The gateway validates that wire shape, binds account/actor/frontend scope plus its pinned deploy/generation pair, and SystemWorker verifies that exact generation and frontend binding before write admission and delegation to the corresponding FrontendRepo (../../packages/frontend/src/pushStagedCommands.ts:63-105, ../../packages/dispatch-worker/src/FrontendApi/FrontendApi.ts:171-203, ../../packages/dispatch-worker/src/FrontendApi/FrontendApi.ts:408-431, ../../packages/system-worker/src/SystemWorker.ts:1960-2186).

FrontendRepo classifies each session in staged-cursor order. An exact command still in an open pushed block returns as pending; a reused cursor with different command content fails as a conflict; cursors at or below the terminal and processed SQLite-KV watermarks fail with distinct terminal/processed codes; only higher cursors enter new admission (../../packages/system-worker/src/FrontendRepo/pushCommands/pushCommands.ts:75-299).

After bootstrap, FrontendRepo reads its repo-local last account cursor once at the start of the admission transaction. New admission then uses that same optimistic SQLite frontier: it decodes and validates the frontend payload, runs frontend guards, makes mutations, and isolates the command inside `withSavepoint`. Each success receives a global pushed cursor and persists its complete pushed command plus one encoded applied-mutation row per command/mutation index; each failure rolls back that command while successful siblings continue (../../packages/system-worker/src/FrontendRepo/pushCommands/pushCommands.ts:121-144, ../../packages/system-worker/src/FrontendRepo/pushCommands/pushCommands.ts:301-420, ../../packages/system-worker/src/FrontendRepo/FrontendRepo.ts:41-106).

All successes from one RPC form one immutable FrontendRepo-assigned pushed block stamped with that single `admissionLastAccountCursor`. The transaction commits optimistic resource rows, pushed lifecycle rows, mutation inverses, the pushed-block outbox row, staged-cursor watermarks, and `lastRebasedPushedCursor` before returning. Acceptance is visible immediately only through the origin response and later `getFrontendState`; it does not emit a frontend block (../../packages/core/src/contracts/types.ts:282-297, ../../packages/core/src/contracts/CommandSchema.ts:155-162, ../../packages/system-worker/src/FrontendRepo/pushCommands/pushCommands.ts:395-471, ../../packages/system-worker/src/FrontendRepo/getFrontendState/getFrontendState.ts:47-84).

Pushed-block delivery selects unfinalized rows by first pushed cursor. Each row gets three total attempts using an exponential schedule; a failed row stores its failure and ends the drain before later blocks can overtake it. There is no pushed-block retry alarm: `pushCommands`, `getFrontendState`, and actor-block handling start a later drain. A successful row is marked finalized but retained until the matching actor block returns (../../packages/system-worker/src/FrontendRepo/drainPushedBlockOutbox/drainPushedBlockOutbox.ts:33-129, ../../packages/system-worker/src/FrontendRepo/FrontendRepo.ts:166-247, ../../packages/system-worker/src/FrontendRepo/FrontendRepo.ts:262-275).

`AccountRepo.finalizePushedCommands` checks command scope and first looks up the account-block outbox by the unique nullable `pushedBlockId`; a duplicate returns the stored result before reading a cursor or resolving a guard. A new block always re-runs frontend-to-account adaptation and authoritative preparation from the full pushed commands, then applies retained ServiceBlocks and tracks the cursor of each relevant intermediate AccountBlock. Only after alignment does it compare the current cursor once with the block's admission cursor (../../packages/system-worker/src/AccountRepo/AccountRepo.ts:103-165, ../../packages/system-worker/src/AccountRepo/finalizePushedCommands/finalizePushedCommands.ts:85-292, ../../packages/system-worker/src/AccountRepo/finalizePushedCommands/finalizePushedCommands.ts:294-472).

Exact cursor equality, including `null === null`, trusts the frontend guard results. A mismatch makes AccountRepo resolve the original frontend contract and guard array, decode and validate each original frontend payload, and rerun those guards in declared order inside each command's existing savepoint. Both modes still apply the prepared authoritative mutations, allocate normal account cursor/index outcomes, and continue after an isolated command failure. The admission cursor certifies only prior frontend guard evaluation; adaptation, preparation, alignment, authoritative application, ledger assignment, publication, and fanout always remain AccountRepo work (../../packages/system-worker/src/AccountRepo/finalizePushedCommands/finalizePushedCommands.ts:470-615).

The resulting immutable account block preserves full pushed-command provenance in every terminal outcome and carries its `pushedBlockId`. ActorRepo is projection-only: it applies finalized mutations, computes actor selections, and forwards that provenance and those outcomes unchanged in the actor block (../../packages/system-worker/src/AccountRepo/finalizePushedCommands/finalizePushedCommands.ts:556-615, ../../packages/system-worker/src/types.ts:117-164, ../../packages/system-worker/src/ActorRepo/handleAccountBlocks/handleAccountBlocks.ts:90-177).

## Frontend block archive and websocket

FrontendRepo and ServiceFrontendRepo drain unpublished lineage rows in strict
`frontendIndex` order to their distinct matching archives. Each archive checks
the complete target identity, accepts an existing index only when its canonical
bytes are identical, rejects gaps or conflicts, and requires an inherited
segment's first local row to be the recorded generation boundary. Broadcast
happens only after the atomic archive append commits
(../../packages/system-worker/src/FrontendBlockRepo/storeFrontendBlocks/storeFrontendBlocks.ts:13-280,
../../packages/system-worker/src/ServiceFrontendBlockRepo/storeServiceFrontendBlocks/storeServiceFrontendBlocks.ts:13-286).

The account and service websocket routes mint and consume different one-use
tickets and resolve the server-owned archive name; the browser never supplies a
Durable Object name. Once connected, the first and only client-authored frame is
the current replica generation and `frontendIndex`. A target-generation resume
receives the exact local suffix and `replay-complete`. A cross-generation resume
receives the source suffix through its terminal bound, exactly the first
successor boundary, a validated `lineage-transition-required` control carrying
the remaining boundary chain, and close code 4002
(../../packages/system-worker/src/FrontendBlockRepo/onMessage/onMessage.ts:19-377,
../../packages/system-worker/src/ServiceFrontendBlockRepo/onMessage/onMessage.ts:19-371,
../../packages/system-worker/src/SystemWorker.ts:2584-2807).

Ticket authority stays on a ready source generation while its read admission is
`open` or `draining`, so a frozen pre-switch archive can mint fresh reconnect
tickets even though command writes are closed. Only after the source is
`drained` may authority move by walking complete recorded successor links and
verifying every target's inverse predecessor. The final generation must be
ready with `open` or `draining` read admission, and its projection/archive pair
must exist and prove archive coverage before its SystemRepo stores the one-use
ticket. State reads and account pushes remain source-bound instead of following
that chain
(../../packages/system-worker/src/createFrontendWebSocketTicket/createFrontendWebSocketTicket.ts:38-240,
../../packages/system-worker/src/createFrontendWebSocketTicket/createFrontendWebSocketTicket.ts:243-418,
../../packages/system-worker/src/createServiceFrontendWebSocketTicket/createServiceFrontendWebSocketTicket.ts:82-265,
../../packages/system-worker/src/createServiceFrontendWebSocketTicket/createServiceFrontendWebSocketTicket.ts:268-452).

Direct browser mode reacts to that control by reauthenticating the exact target,
repairing from its bound full state, applying the already received boundary as
the transition receipt, and reconnecting with a fresh ticket and changing resume
watermark. State-required gaps also repair before reconnect. Ordinary reconnect
uses exponential delay capped at 30 seconds and never reuses a spent ticket
(../../packages/react/src/acquireFrontendWebSocket.ts:62-874,
../../packages/react/src/acquireServiceFrontendWebSocket.ts:85-900).

A same-generation frontend-version change preserves the old account and service
replicas as readable archive consumers and reports `update-required`. Service is
already read-only. Account writes are suspended and its unfinished journal rows
become dormant until matching code acquires or commissions the authoritative
version; the source replica, physical database, and command bytes are retained
(../../packages/react/src/acquireFrontendWebSocket.ts:274-417,
../../packages/react/src/acquireServiceFrontendWebSocket.ts:290-433,
../../packages/shared-worker/src/SharedWorker/makeSharedWorkerHost.ts:1992-2060,
../../packages/shared-worker/src/SharedWorker/makeSharedWorkerHost.ts:2198-2305,
../../packages/shared-worker/src/SharedWorker/makeSharedWorkerHost.ts:3170-3369,
../../packages/shared-worker/src/SharedWorker/makeSharedWorkerHost.ts:4739-4934).

Session block application first validates the exact target and contiguous
`replicaIndex`; an equal index is accepted only when the canonical encoding
equals the supplied previous block. Local-command replica blocks apply their
already-computed resource, lifecycle, and optimistic-mutation rows directly in
one transaction. Ordinary server blocks rewind local overlays, apply
authoritative resources, reconcile pending commands, persist full executed or
failed authority, remove local intent, then replay stored encoded mutations and
recompute inverses without rerunning authored contracts. A replay error aborts
block application for repair rather than inventing a local failed command. An
existing local failure still suppresses an authoritative execution row, while
an authoritative failure replaces its details
(../../packages/core/src/session/applyFrontendBlock.ts:83-166,
../../packages/core/src/session/applyFrontendBlock.ts:168-452,
../../packages/core/src/session/applyFrontendBlock.ts:455-605,
../../packages/core/src/session/applyFrontendBlock.ts:607-797,
../../packages/core/src/session/applyFrontendBlock.ts:799-891).

The public dispatch Worker validates the two fixed request shapes and forwards
the unchanged upgrade to SystemWorker. SystemWorker consumes the appropriate
generation-local ticket, receives its server-derived repo name, and only then
forwards to the account or service archive binding. A spent ticket is not
restored if the final forward fails
(../../packages/dispatch-worker/src/Worker.ts:21-92,
../../packages/system-worker/src/SystemWorker.ts:2584-2807). See
[[FrontendWebSocket]] for the full admission, replay, and hibernation boundary.

## Recovery guarantees

1. AccountRepo, ActorRepo, ServiceRepo, and FrontendRepo write their outbox row before downstream delivery; downstream archives use unique cursor/index keys for idempotence. AccountRepo additionally enforces a unique nullable `pushedBlockId`, so retrying the same FrontendRepo block returns the existing authoritative account block (../../packages/system-worker/src/AccountRepo/AccountRepo.ts:112-167, ../../packages/system-worker/src/AccountRepo/finalizePushedCommands/finalizePushedCommands.ts:83-169).
2. AccountBlockRepo, ActorBlockRepo, and ServiceBlockRepo persist exact prefixed
   downstream repo names with subscriber watermarks and retry metadata, so a
   failed delivery resumes against the same Durable Object from the durable
   cursor rather than reconstructing an unprefixed name or relying on process
   memory (../../packages/system-worker/src/AccountBlockRepo/accountBlockDrizzleSchemas.ts:184-214,
   ../../packages/system-worker/src/ActorBlockRepo/ActorBlockRepo.ts:90-106,
   ../../packages/system-worker/src/ServiceBlockRepo/ServiceBlockRepo.ts:40-56).
3. AccountRepo owns each service cursor. Full FrontendRepo state exposes the
   logical `frontendIndex`, `lastRebasedPushedCursor`, resources, pending pushed
   commands, and complete executed and failed pushed terminal rows. Ordinary
   convergence blocks separately carry `lastAccountCursor` plus the pending,
   terminal, and rebase metadata, preventing optimistic commands already
   represented by server state from being replayed. FrontendRepo defines
   separate pending, executed, and failed command tables and reruns its
   idempotent schema migration on every cold start so additive terminal tables
   exist before any RPC reads or writes them
   (../../packages/system-worker/src/FrontendRepo/getFrontendState/getFrontendState.ts:332-379,
   ../../packages/core/src/session/types.ts:76-106,
   ../../packages/system-worker/src/FrontendRepo/FrontendRepo.ts:91-162,
   ../../packages/system-worker/src/FrontendRepo/FrontendRepo.ts:246-276).
4. Canonical snapshot insertion creates the replicated row; the owning
   service's delete mutation terminally marks and retains it. There is no
   account-initiated release or undelete API
   (../../packages/system-worker/src/AccountRepo/finalizeAccountBlock/finalizeCommandsTx.ts:137-169,
   ../../packages/system-worker/src/AccountRepo/handleServiceBlocks/handleServiceBlocks.ts:112-171).
5. FrontendRepo pushed-block failures remain durable on the first failed row, preserve strict pushed-cursor order, and resume only when later FrontendRepo activity starts another drain; the pushed-block path deliberately has no retry alarm (../../packages/system-worker/src/FrontendRepo/drainPushedBlockOutbox/drainPushedBlockOutbox.ts:47-129, ../../packages/system-worker/src/FrontendRepo/FrontendRepo.ts:166-275).
6. ServiceFrontendRepo independently stores source-block receipts, projection
   state, and an archive outbox. Irrelevant source blocks advance its causal
   service watermark without inventing a frontend delta; relevant blocks and
   generation boundaries remain exactly target-bound
   (../../packages/system-worker/src/ServiceFrontendRepo/ServiceFrontendRepo.ts:95-159,
   ../../packages/system-worker/src/ServiceFrontendRepo/handleServiceBlocks/handleServiceBlocks.ts:89-298).
7. The SharedWorker partition catalog persists separate account and service
   replica rows, database history, commissioning/ready/failed state, role,
   logical and physical indexes, pending transition, socket state, and failure.
   Acquisition returns a captured snapshot before opening its buffered-block
   gate, so concurrent socket delivery cannot race ahead of initial hydration
   (../../packages/shared-worker/src/SharedWorker/partitionSchemas.ts:212-333,
   ../../packages/shared-worker/src/SharedWorker/makeSharedWorkerHost.ts:1758-1883,
   ../../packages/shared-worker/src/SharedWorker/makeSharedWorkerHost.ts:4568-4712).
8. Account local intent is partition-owned journal data, not replica-database
   data. Repair builds a replacement database, rematerializes eligible journal
   commands, and atomically repoints the catalog while retaining previous
   database names. Legacy replica rows and old physical databases are
   quarantined or retained; normal acquisition does not delete the only copy of
   unpushed commands
   (../../packages/shared-worker/src/SharedWorker/partitionSchemas.ts:181-210,
   ../../packages/shared-worker/src/SharedWorker/partitionSchemas.ts:335-453,
   ../../packages/shared-worker/src/SharedWorker/makeSharedWorkerHost.ts:825-1756).
9. A worker transition control is not authority by itself. Account and service
   runtimes prove that the persisted previous block is the exact applied
   source-to-successor generation boundary, then validate an ordered acyclic
   descriptor chain through the target. Acquisition repeats that proof before
   trusting a persisted transition; failure leaves the source catalog,
   database, and account journal available for diagnosis or retry
   (../../packages/shared-worker/src/SharedWorker/makeSharedWorkerHost.ts:2481-2607,
   ../../packages/shared-worker/src/SharedWorker/makeSharedWorkerHost.ts:5104-5226,
   ../../packages/shared-worker/src/SharedWorker/makeSharedWorkerHost.ts:5982-6130,
   ../../packages/shared-worker/src/SharedWorker/makeSharedWorkerHost.ts:7275-7419).
10. A same-generation frontend-version change preserves archive read continuity
    but not account write authority. Both replica kinds remain readable under
    `update-required`; account journal work is suspended and made dormant, while
    the service replica remains read-only
    (../../packages/shared-worker/src/SharedWorker/makeSharedWorkerHost.ts:1992-2060,
    ../../packages/shared-worker/src/SharedWorker/makeSharedWorkerHost.ts:3170-3369,
    ../../packages/shared-worker/src/SharedWorker/makeSharedWorkerHost.ts:4739-4934).
