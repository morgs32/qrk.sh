/**
 * Stable Workers for Platforms dispatch script name for one authenticated
 * system environment.
 */
import type { ISystemId } from '@zerospin/core/system/types';

export function makeSystemWorkerName(
  props:
    | {
        systemId: ISystemId;
        systemEnvironmentId: 'dev';
        clerkUserId: string;
      }
    | {
        systemId: ISystemId;
        systemEnvironmentId: 'production';
      },
): string {
  const { systemEnvironmentId, systemId } = props;
  if (systemEnvironmentId === 'dev') {
    const { clerkUserId } = props;
    if (clerkUserId.length === 0) {
      throw new Error(
        'Hosted development system worker name requires a non-empty clerkUserId.',
      );
    }
    return `${systemId}:${clerkUserId}`;
  }
  return systemId;
}
