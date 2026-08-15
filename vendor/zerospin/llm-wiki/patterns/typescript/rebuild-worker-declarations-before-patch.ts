/**
 * Rebuild worker declaration output before patching consumer inference.
 *
 * @bad Do not add a local cast when the SystemWorker type is missing from stale dist.
 */
import type { SystemWorker } from 'system-worker';

export async function pushFromApis(props: { aggregateId: string }) {
  const entrypoint = (await getSystemWorker({
    aggregateId: props.aggregateId,
  })) as SystemWorker;

  return entrypoint.pushCommands(props);
}

declare function getSystemWorker(props: {
  aggregateId: string;
}): Promise<unknown>;

// Before typecheck: nx run system-worker:lib
