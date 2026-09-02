# Cleanup case studies

Concrete smells and fixes. Each page links to a pattern file — no duplicated good-vs-bad prose here.

## Smell → case

| Smell / keyword                                                    | Case                                                                                           | Pattern                                                    |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| inline, one consumer                                               | [inline-one-consumer-helper](./2026-06-20-inline-one-consumer-helper.md)                       | `system-worker/inline-small-repo-logic-into-do-method.ts`  |
| double validate                                                    | [stop-redundant-prevalidation](./2026-06-20-stop-redundant-prevalidation.md)                   | `apis/trust-boundary-validation-in-api-not-repo.ts`        |
| read-only, makeTx                                                  | [db-read-not-makeTx](./2026-06-17-db-read-not-makeTx.md)                                       | `system-worker/read-only-drizzle-on-db-not-maketx.ts`      |
| stale type files                                                   | [delete-stale-type-files](./2026-06-20-delete-stale-type-files.md)                             | `typescript/dont-match-stale-dist.ts`                      |
| IEncodedCommand boundary                                           | [encoded-command-at-boundary-only](./2026-06-19-encoded-command-at-boundary-only.md)           | `contracts/iencoded-command-at-boundary-only.ts`           |
| chain admission, materializer execution, retained terminal history | [command-chain-materializer-ownership](./2026-08-31-command-chain-materializer-ownership.md)   | `system-worker/aggregate-command-chain-materialization.ts` |
| subscriber catch-up, latest tip, acknowledgement                   | [command-chain-subscriber-anti-entropy](./2026-08-31-command-chain-subscriber-anti-entropy.md) | `system-worker/command-chain-subscriber-anti-entropy.ts`   |
| terminal occurrence, command-local delta, complete payload         | [terminal-command-delta](./2026-08-31-terminal-command-delta.md)                               | `system-worker/preserve-command-payloads-across-chains.ts` |
| vitest runtime lanes                                               | [sync-vitest-config-by-runtime](./2026-06-27-sync-vitest-config-by-runtime.md)                 | `system-worker/vitest-runtime-boundaries.ts`               |
| RpcTarget method folders                                           | [system-worker-repo-method-folders](./2026-06-28-system-worker-repo-method-folders.md)         | `rpc/rpc-target-method-folders.ts`                         |
