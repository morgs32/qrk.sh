/**
 * Address the singleton SystemRepo by the configured system ID and keep reads on that singleton.
 *
 * @bad Address more than one SystemRepo for a system or omit the configured system ID.
 * @bad Add deployment or generation qualifiers to singleton SystemRepo reads.
 */
export function loadRegisteredAggregateIds(props: { systemId: string }) {
  const systemRepo = SystemRepo.getRepo({ systemId: props.systemId });
  return systemRepo.getAggregateIds();
}

declare const SystemRepo: {
  getRepo: (props: { systemId: string }) => {
    getAggregateIds: () => Promise<readonly string[]>;
  };
};
