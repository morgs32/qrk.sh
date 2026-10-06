# Async operations

Each aggregate/service VersionRepo owns immutable emissions and producer lifecycle in its `asyncOperations` table. `(commandId, operationIndex)` identifies an emission; the owner/version comes from the Repo key. Histories retain immutable emission columns only. [Complete-output readers](readOperationOutput.ts) merge these with `modelOperations` in index order.

[Preparation](prepareAsyncOperation.ts) encodes the external contract's own payload. Only original execution allocates a child ID and retains exact actor authority and a recovery deadline. Those writes share the model/terminal-result transaction and business savepoint. Replay inserts immutable emissions with null lifecycle; received history and actor projections never create production work.

[The runner](makeAsyncOperations.ts) starts after commit, outside execution gates. Different items run concurrently; each item remains active through timeout interruption and finalizer settlement. Durable deadlines and alarms recover pending production. An encoded response, its recording timestamp, deadline clearing, and minimal child-command outbox entry commit together. The timestamp distinguishes recorded JSON null from unfinished work. Recording is immutable; continuation rejection preserves evidence and cannot repeat production.

[Child reconstruction](readPreparedAsyncCommand.ts) uses the retained payload, response, actor pins and Repo key, including the aggregate row's retained system name. It never reads the initiating mapping or source command. Delivery retries reuse the same child ID and complete generated command. Acknowledgement removes only pending outbox entries; its monotonic head and recorded response survive. Missing definitions and producer/delivery failures retain explicit diagnostics. Source publication cleanup cannot delete pending work or recorded evidence. Pruning is deferred.

External requests may suspend and use runtime services. Continuations and mappings must complete synchronously. Providers must supply business idempotency or reconciliation for a remote effect interrupted before local response recording.

Changed fixed schemas require empty storage. The focused async fixtures and disposable Workerd restart harness verify production, recording, delivery and replay boundaries.
