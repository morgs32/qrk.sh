/**
 * Stable Workers for Platforms dispatch script name for one authenticated
 * system environment.
 */
import type { ICloudApiKeyIdentity } from 'system-worker/ApiKeyIdentityResolver/ApiKeyIdentityResolver';

export function makeSystemWorkerName(
  props:
    | {
        systemId: ICloudApiKeyIdentity['systemId'];
        systemEnvironmentId: 'dev';
        clerkUserId: string;
      }
    | {
        systemId: ICloudApiKeyIdentity['systemId'];
        systemEnvironmentId: 'production';
      },
): ICloudApiKeyIdentity['systemWorkerName'] {
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
