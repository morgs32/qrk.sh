# AggregateVersionChain

AVC retains immutable version-specific terminal commands and owned operations in contiguous `executedIndex` order. Failed admission, failed execution and empty successful outputs remain individual terminal positions.

[Publication](receiveExecutedCommands/receiveExecutedCommands.ts) validates command identity, disposition hashes, operation order and exact duplicate retention transactionally. Actor fanout reads this retained history; actors project owned outputs without rerunning the originating program.

Changed fixed schemas require empty storage. No translation or fallback decoder is supplied. Existing checks: `system-worker:contract-programs:check` and `system-worker:command-history:restart:check`.
