import { ZerospinError } from '@zerospin/error';
import { Effect } from 'effect';

import type { IAnyService } from './types.ts';

export const requireVersion = Effect.fn('services.requireVersion')(function* <
  SERVICE extends IAnyService,
>(service: SERVICE, requestedVersion: string) {
  const { name, version } = service;
  if (requestedVersion !== version) {
    return yield* new ZerospinError({
      code: 'service-version-unsupported',
      message: `Service "${name}" is version "${version}", not "${requestedVersion}"`,
      extra: {
        serviceName: name,
        serviceVersion: version,
        currentVersion: version,
        requestedVersion,
      },
    });
  }
  return service;
});
