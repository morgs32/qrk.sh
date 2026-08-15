import { encodeLeft } from '@zerospin/core/utils/encodeLeft';
import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

export const getReadiness = Effect.fn('DevDeployApiFailure.getReadiness')(
  (props: { error: IAnyError }) => Effect.succeed(encodeLeft(props.error)),
);
