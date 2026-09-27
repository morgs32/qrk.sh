import { resultFailure } from '@zerospin/core/utils/resultFailure';
import {
  encodeError,
  type IAnyError,
  type IZerospinErrorJson,
} from '@zerospin/error';
import { Effect } from 'effect';

import type { SystemApi } from '../../SystemApi.js';

/*
 * SystemApiFailure.executeServiceQuery answers calls on a rejected capability.
 * It returns the original admission error without executing the requested operation.
 *
 * 1. Read the retained admission error.
 * 2. Return the linked RPC failure envelope.
 */
export const executeServiceQuery = Effect.fn(
  'SystemApiFailure.executeServiceQuery',
)((props: {
  error: IAnyError | IZerospinErrorJson;
  request: Parameters<SystemApi['executeServiceQuery']>[0];
}) => {
  // 1 — ignore operation arguments because this capability was never granted
  const { error } = props;

  // 2 — encode the retained error and leave the trace link null
  return encodeError(error).pipe(
    Effect.map(failure => ({ result: resultFailure(failure), link: null })),
  );
});
