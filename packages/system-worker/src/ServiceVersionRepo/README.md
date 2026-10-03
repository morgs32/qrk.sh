# ServiceVersionRepo

The Repo executes admitted service commands for one exact service version. Synchronous preparation collects base and mapper output against pre-application state. [Commit](executeCommands/executeCommandsTx.ts) applies owned model operations under a business savepoint and retains terminal output, disposition progress and publication intent together.

Complete output merges `modelOperations` and `asyncOperations` by `(commandId, operationIndex)`. Only a command whose admitted service version equals this Repo's version initializes async production authority. Historical execution retains its mapped output with null async lifecycle and applies only model operations. Rejection or failed application rolls back all new emissions.

[Publication](readExecutedCommandsPage.ts) carries the retained command row and immutable operation output to ServiceVersionChain. Identical delivery retries compare that same retained representation. Acknowledgement can delete model publication material; producer-owned async rows remain independently recoverable through [asyncOperations](../asyncOperations/README.md). Actor projections preserve operation indexes while skipping async application.

Changed fixed schemas require empty storage; no compatibility decoder or translation is supplied.
