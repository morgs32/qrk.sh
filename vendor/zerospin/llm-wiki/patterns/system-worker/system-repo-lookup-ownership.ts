/**
 * Address the singleton SystemRepo by system ID and qualify generation-owned reads.
 *
 * @bad Address one SystemRepo per generation or omit the configured system ID.
 * @bad Read generation-owned rows without the generation ID that locates them.
 */
export function loadRegisteredAggregateIds(props: {
  systemId: string;
  generationId: string;
}) {
  const systemRepo = SystemRepo.getRepo({ systemId: props.systemId });
  return systemRepo.getAggregateIds({ generationId: props.generationId });
}

declare const SystemRepo: {
  getRepo: (props: { systemId: string }) => {
    getAggregateIds: (props: {
      generationId: string;
    }) => Promise<readonly string[]>;
  };
};
