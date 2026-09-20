import { encodeFailure } from '@zerospin/core/utils/encodeFailure';
import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';

import type { AggregateFrontendApi } from '../../AggregateFrontendApi.js';

/*
 * AggregateFrontendApiFailure.getSnapshot answers calls on a rejected capability.
 * It returns the original admission error without executing the requested operation.
 *
 * 1. Read the retained admission error.
 * 2. Return the linked RPC failure envelope.
 */
export const getSnapshot = Effect.fn('AggregateFrontendApiFailure.getSnapshot')(
  (props: {
    error: IAnyError;
    request: Parameters<AggregateFrontendApi['getSnapshot']>[0];
  }) => {
    // 1 — ignore operation arguments because this capability was never granted
    const { error } = props;

    // 2 — encode the retained error and leave the trace link null
    return Effect.succeed({ result: encodeFailure(error), link: null });
  },
);
