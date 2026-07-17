/**
 * Stable Workers for Platforms dispatch script name for one system instance.
 */
import type { ISystemId } from '@zerospin/core/system/types';

export function makeSystemWorkerName(props: {
  systemId: ISystemId;
  instanceId: string;
}): string {
  const { systemId, instanceId } = props;
  if (instanceId.length === 0) {
    throw new Error('System worker name requires a non-empty instanceId.');
  }
  return `${systemId}:${instanceId}`;
}
