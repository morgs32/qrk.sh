# AggregateChain

AC owns the durable order of admitted aggregate commands. [Admission](admitCommands/admitCommandsTx.ts) synchronously retains each command, its original execution version, node provenance and admission disposition. Identical retry returns the original command; conflicting node identity/order rolls back the batch.

[Input paging](readInputsPage/readInputsPage.ts) delivers an unfinished command to its original executor. Other versions wait for the saved original terminal result, then rerun their own program against owned state.

[Original result retention](receiveOriginalResults/receiveOriginalResults.ts) atomically saves the terminal disposition and owned outputs. VAR's independent original-result outbox and version-history outbox recover until their respective receivers acknowledge. Duplicate retention succeeds only for identical records.

Activation reconciles deployed materializers while preserving acknowledged cursors. Shared fanout remains for these materializers; there is no external resource intake or enrollment.

Changed fixed schemas require empty storage. No translation or fallback decoder is supplied. Existing checks: `system-worker:contract-programs:check` and `system-worker:command-history:restart:check`.
