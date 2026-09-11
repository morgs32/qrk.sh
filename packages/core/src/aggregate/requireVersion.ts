import { ZerospinError } from '@zerospin/error';
import { Effect } from 'effect';

import type { IAnyAuthoredAggregate } from './types.ts';

export const requireVersion = Effect.fn('aggregates.requireVersion')(function* <
  AGGREGATE extends IAnyAuthoredAggregate,
>(aggregate: AGGREGATE, requestedVersion: string) {
  const { name, version } = aggregate;
  if (requestedVersion !== version) {
    return yield* new ZerospinError({
      code: 'aggregate-version-unsupported',
      message: `Aggregate "${name}" is version "${version}", not "${requestedVersion}"`,
      extra: {
        aggregateName: name,
        aggregateVersion: version,
        currentVersion: version,
        requestedVersion,
      },
    });
  }
  return aggregate;
});
