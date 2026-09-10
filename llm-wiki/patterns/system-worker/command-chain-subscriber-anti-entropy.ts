/**
 * Subscriber-owned catch-up commits bounded pages before live enrollment.
 *
 * AAC and SAC send complete admitted envelopes to VAR and VSR. Their
 * source-bound subscribers execute supplied rows and share the same receive
 * Effect with pull catch-up. VAFC and VSFC send complete terminal envelopes
 * to replicas, which replay retained mutations without authored programs.
 * VAR and UVAR independently consume their pinned VSFC service histories;
 * SAC does not route finalized service occurrences through AAC.
 *
 * Each `${queueName}Subscriber(sourceKey)` target binds one source queue,
 * enrollment key, and durable receiver cursor. `catchup(index?)` requests
 * `queue.getPage({ afterIndex, maxIndex? })`. Its first response supplies
 * the fixed destination when the caller omitted one; later `lastIndex` values
 * do not move that destination. Pulled and pushed `IFanoutDelivery` envelopes
 * use the same receive operation and commit local state/output before success.
 * Source acknowledgements advance only to the last committed delivered row.
 *
 * `subscriber.subscribe(index?)` completes catch-up, rereads durable progress,
 * then enrolls through `queue.subscribe`. Retained history covers rows appended
 * between catch-up and enrollment. No receiver permit spans page requests or
 * source enrollment. Empty history at zero succeeds; missing history below the
 * destination and non-advancing receipts fail rather than recurse indefinitely.
 *
 * Replica snapshot paths delegate paging to these source-bound subscribers.
 * Resource-specific repair behind an already advanced service cursor remains
 * with the owner, as do version registration and terminal-result recovery.
 * See `i-fanout-repo.ts` for the factory and accessor contracts.
 *
 * @bad Treat the envelope's lastIndex as acknowledgement of its whole history.
 * @bad Advance the subscriber frontier before local state and output commit.
 * @bad Re-execute authored code in a terminal-history replica.
 * @bad Keep a second transport paging loop in a Repo.
 * @bad Call VersionedAggregateRepo.catchup; that RPC is deleted.
 */
export {};
