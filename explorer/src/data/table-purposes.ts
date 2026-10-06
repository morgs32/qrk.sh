export const tablePurposes: Readonly<Record<string, string>> = {
  'system/aggregates': 'Registered aggregate names and IDs within the system.',
  'system/lockedAggregateActorVersions':
    'Immutable authored actor definitions, keyed within each aggregate name.',
  'system/lockedServiceActorVersions':
    'Immutable authored actor definitions, keyed within each service name.',
  'system/lockedAggregateVersions':
    'Immutable authored aggregate definitions for each name and version.',
  'system/lockedServiceVersions':
    'Immutable authored service definitions for each name and version.',
  'system/aggregateSessionWebSocketTickets':
    'Expiring single-use tickets pinned to an exact aggregate actor session.',
  'system/serviceSessionWebSocketTickets':
    'Expiring single-use tickets pinned to an exact service actor session.',
  'system/repos':
    'Activated repository catalog and the table names owned by each instance.',
  'log/admissionAttempts':
    'Admission diagnostics, claims, selection and the recorded outcome.',
  'log/logs': 'Ordered system diagnostic messages and optional payloads.',
  'log/telemetrySpans':
    'Trace spans with parent identity, timing and recorded status.',
  'log/telemetryLogs':
    'Diagnostic events correlated with a trace and optional retained span.',
  'log/telemetryLinks':
    'Causality and retry links from a retained span to prior trace context.',
  'ac/commands':
    'Admitted inputs in aggregateIndex order, with the original execution version.',
  'ac/results':
    'Returned original execution result for each admitted aggregate index.',
  'ac/modelOperations':
    'Retained ordered model writes from original execution.',
  'ac/asyncOperations':
    'Retained async emissions without version-repo production authority or lifecycle.',
  'ac/aggregateVersionRepos':
    'Aggregate-version delivery registrations, activation and acknowledged admission cursors.',
  'avr/modelOperations':
    'Ordered model output held for version-history and original-result publication.',
  'avr/asyncOperations':
    'Version-owned async emissions, retained producer authority, observation and recovery deadline.',
  'avr/head':
    'Committed aggregate admission, execution and disposition-hash checkpoint.',
  'avr/executedCommandOutbox':
    'Pending complete terminal output for AggregateVersionChain.',
  'avr/executedAggregateCommandOutbox':
    'Pending original terminal result returned to AggregateChain.',
  'avr/asyncCommandOutbox':
    'Recorded async child commands awaiting admission to AggregateChain.',
  'avr/asyncCommandOutboxHead':
    'Monotonic position allocator for async child delivery work.',
  'avc/aggregateCommands':
    'Immutable version-specific terminal commands in executedIndex order.',
  'avc/modelOperations':
    'Retained ordered model output for actor projection replay.',
  'avc/asyncOperations':
    'Retained async emissions for history; no producer lifecycle.',
  'avc/executedCommandsFanoutSubscribers':
    'Actor-repo registrations and acknowledged terminal-history delivery cursors.',
  'aavr/commands':
    'Retained aggregate inputs and admission/execution lifecycle results.',
  'aavr/stagedCommands':
    'Saved optimistic operations, staging order and terminal resolution.',
  'aavr/stagedAggregateCommandOutbox':
    'Full staged commands awaiting durable AggregateChain admission.',
  'aavr/actorState': 'Confirmed aggregate projection checkpoint and hash.',
  'aavr/browserCommandOutbox':
    'Selected deltas and private command outcomes awaiting actor-chain retention.',
  'aavc/browserCommands':
    'Durable selected output and private outcomes for replay before websocket broadcast.',
  'aavc/connectionLocks':
    'Retained capability locks for websocket connections.',
  'sc/commands': 'Admitted service inputs in serviceIndex order.',
  'sc/serviceSubscribers':
    'Service-version delivery registrations, activation and acknowledged admission cursors.',
  'svr/commands':
    'Retained terminal command results for this exact service version.',
  'svr/modelOperations':
    'Ordered model output awaiting version-history publication.',
  'svr/asyncOperations':
    'Version-owned async emissions, producer observations and recovery deadlines.',
  'svr/head':
    'Committed service admission, execution and disposition-hash checkpoint.',
  'svr/executedCommandOutbox':
    'Pending complete terminal output for ServiceVersionChain.',
  'svr/asyncCommandOutbox':
    'Recorded async child commands awaiting ServiceChain admission.',
  'svr/asyncCommandOutboxHead':
    'Monotonic position allocator for async child delivery work.',
  'svc/commands': 'Immutable service-version terminal commands and results.',
  'svc/modelOperations':
    'Retained ordered model output for actor projection replay.',
  'svc/asyncOperations':
    'Retained async emissions for history; no producer lifecycle.',
  'svc/executionResultsFanoutSubscribers':
    'Authored service-actor registrations and acknowledged result-delivery cursors.',
  'savr/commands':
    'Locally retained service terminal commands consumed by this actor.',
  'savr/modelOperations':
    "Owner model writes replayed into this actor's confirmed replica.",
  'savr/asyncOperations':
    'Retained async emissions skipped during actor replay.',
  'savr/actorState': 'Confirmed service projection checkpoint and hash.',
  'savr/browserCommandOutbox':
    'Selected deltas and private command outcomes awaiting actor-chain retention.',
  'savc/browserCommands':
    'Durable selected output and private outcomes for replay before websocket broadcast.',
  'aggregate-node/commands':
    'Durable aggregate occurrence journal, original known input, admission and terminal progress.',
  'aggregate-node/nodeMetadata':
    'Bound session identity, submission allocation, terminal prefix and aggregate change checkpoints.',
  'service-node/commands':
    'Durable service occurrence journal, original known input, admission and terminal progress.',
  'service-node/nodeMetadata':
    'Bound session identity, submission allocation, terminal prefix and service change checkpoints.',
  'session/commands':
    'Observed service occurrences, known staged input and terminal outcomes.',
  'session/optimisticAppliedOperations':
    'Inverse bookkeeping for unresolved service optimism.',
  'session/serviceSessionMetadata':
    'Session identity and confirmed service execution cursor, hash and version.',
  'aggregate-session/commands':
    'Local aggregate session command journal, staging and confirmed outcomes.',
  'aggregate-session/optimisticAppliedOperations':
    'Saved optimistic model operations for each local command.',
  'aggregate-session/sessionMetadata':
    'Actor session identity, local command allocation and confirmed cursors.',
};
