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
  if (props.systemEnvironmentId === 'dev') {
    if (props.clerkUserId.length === 0) {
      throw new Error(
        'Hosted development system worker name requires a non-empty clerkUserId.',
      );
    }
    return `${props.systemId}:${props.clerkUserId}`;
  }
  return props.systemId;
}
