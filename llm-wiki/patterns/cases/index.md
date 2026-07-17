# Cleanup case studies

Concrete smells and fixes. Each page links to a pattern file — no duplicated good-vs-bad prose here.

## Smell → case

| Smell / keyword                   | Case                                                                                             | Pattern                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| inline, one consumer              | [inline-one-consumer-helper](./2026-06-20-inline-one-consumer-helper.md)                         | `system-worker/inline-small-repo-logic-into-do-method.ts` |
| CommandRepo finalize, ledger role | [commandrepo-ledger-not-finalizer](./2026-06-20-commandrepo-ledger-not-finalizer.md)             | `system-worker/account-repo-finalization-fanout.ts`       |
| fanout debloat                    | [fanout-package-debloat](./2026-06-21-fanout-package-debloat.md)                                 | `fanout/subscriber-shell-composition-explicit.ts`         |
| double validate                   | [stop-redundant-prevalidation](./2026-06-20-stop-redundant-prevalidation.md)                     | `apis/trust-boundary-validation-in-api-not-repo.ts`       |
| read-only, makeTx                 | [db-read-not-makeTx](./2026-06-17-db-read-not-makeTx.md)                                         | `system-worker/read-only-drizzle-on-db-not-maketx.ts`     |
| stale type files                  | [delete-stale-type-files](./2026-06-20-delete-stale-type-files.md)                               | `typescript/dont-match-stale-dist.ts`                     |
| IEncodedCommand boundary          | [encoded-command-at-boundary-only](./2026-06-19-encoded-command-at-boundary-only.md)             | `contracts/iencoded-command-at-boundary-only.ts`          |
| account finalization mode         | [account-repo-finalization](./2026-06-20-account-repo-finalization.md)                           | `system-worker/account-repo-contract-lookup.ts`           |
| closeAccountBatch split           | [account-repo-finalization-fanout-split](./2026-06-23-account-repo-finalization-fanout-split.md) | `system-worker/account-repo-finalization-fanout.ts`       |
| FanoutRepo lifecycle              | [fanout-repo-directory-and-lifecycle](./2026-06-27-fanout-repo-directory-and-lifecycle.md)       | `fanout/subscriber-owned-downstream-publish.ts`           |
| applied mutations archive         | [applied-mutations-archive-ready](./2026-06-27-applied-mutations-archive-ready.md)               | `system-worker/fanout-inline-payload-shape.ts`            |
| vitest runtime lanes              | [sync-vitest-config-by-runtime](./2026-06-27-sync-vitest-config-by-runtime.md)                   | `system-worker/vitest-runtime-boundaries.ts`              |
| repo method folders               | [system-worker-repo-method-folders](./2026-06-28-system-worker-repo-method-folders.md)           | `system-worker/do-method-calling-same-named-effect-fn.ts` |
