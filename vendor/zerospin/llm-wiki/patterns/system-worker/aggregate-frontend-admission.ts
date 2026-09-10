/**
 * AggregateFrontendApi sends the complete local occurrence to AAC and returns
 * its { aggregateIndex, commandId } admission receipt. Browser optimism stays
 * pending until a terminal per-command UVAC output resolves that command ID.
 * VAR owns preparation and contract and aggregate binding guards; UVAR never executes optimism.
 *
 * @bad Add a server pushed-command chain or optimistic frontend materializer.
 * @bad Strip the local occurrence to payload/session fields at admission.
 * @bad Treat an admission receipt as an authoritative resource delta.
 * @bad Resolve optimism before the terminal output or published snapshot.
 */
export {};
