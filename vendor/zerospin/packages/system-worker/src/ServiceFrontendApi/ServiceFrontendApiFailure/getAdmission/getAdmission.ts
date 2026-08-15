import { encodeLeft } from '@zerospin/core/utils/encodeLeft';
import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

export const getAdmission = Effect.fn('ServiceFrontendApiFailure.getAdmission')(
  (props: { error: IAnyError }) => Effect.succeed(encodeLeft(props.error)),
);
