/**
 * Stable Workers for Platforms dispatch script name for one admitted
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
  const { systemEnvironmentId, systemId, ...environment } = props;
  if (systemEnvironmentId === 'dev') {
    if (
      !('clerkUserId' in environment) ||
      environment.clerkUserId.length === 0
    ) {
      throw new Error(
        'Hosted development system worker name requires a non-empty clerkUserId.',
      );
    }
    return `${systemId}:${environment.clerkUserId}`;
  }
  return systemId;
}
