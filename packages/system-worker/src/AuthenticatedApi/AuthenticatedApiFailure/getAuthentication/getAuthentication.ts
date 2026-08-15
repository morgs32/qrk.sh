import { encodeLeft } from '@zerospin/core/utils/encodeLeft';
import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

export const getAuthentication = Effect.fn(
  'AuthenticatedApiFailure.getAuthentication',
)((props: { error: IAnyError }) => Effect.succeed(encodeLeft(props.error)));
