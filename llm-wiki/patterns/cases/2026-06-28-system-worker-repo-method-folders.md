# System worker repo method folders

## Smell

Public system-worker Repo RPC/lifecycle method bodies kept inline in the class, hidden behind import aliases, or mixed with non-public one-consumer helper guidance.

## Pattern

See `rpc/rpc-target-method-folders.ts`; use `system-worker/inline-small-repo-logic-into-do-method.ts` only for non-public one-consumer helpers inside those method files. The convention now applies to every production `RpcTarget`, not only system-worker Repos.

## When to apply

\*Repo folder layout reviews; moving public DO RPC/lifecycle methods into same-named folders while keeping one-off non-public helpers inline.
