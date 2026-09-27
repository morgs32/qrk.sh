import type { IAggregateSessionLock } from '@zerospin/core/aggregateSession/AggregateSessionLockSchema';
import type { IAggregateSessionSnapshot } from '@zerospin/core/aggregateSession/types';
import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import type { IAdmissionRequest } from '@zerospin/core/identity/types';
import { decodeRpcOutcome } from '@zerospin/core/utils/decodeRpcOutcome';
import { getApi } from '@zerospin/core/utils/getApi/getApi';
import type { IAnyError, IResult, IZerospinErrorJson } from '@zerospin/error';
import {
  annotateFunctionSpan,
  type TelemetryCollector,
} from '@zerospin/logger';
import { Effect } from 'effect';
import type { GatewayApi } from 'system-worker/GatewayApi/GatewayApi';

export const fetchAggregateSessionSnapshot = Effect.fn(
  'fetchAggregateSessionSnapshot',
)(function* (props: {
  apiUrl: string;
  publishableKey: string;
  systemName: string;
  getAdmission(): Promise<
    IResult<IAdmissionRequest, IAnyError | IZerospinErrorJson>
  >;
  aggregateName: string;
  aggregateVersion: string;
  sessionName: string;
  nodeId: string | null;
  aggregateSessionLock: IAggregateSessionLock;
}): Effect.fn.Return<
  IAggregateSessionSnapshot,
  IAnyError | IZerospinErrorJson,
  Async | TelemetryCollector
> {
  const {
    aggregateSessionLock,
    aggregateName,
    apiUrl,
    sessionName,
    getAdmission,
    publishableKey,
    systemName,
    aggregateVersion,
    nodeId,
  } = props;
  const admission = yield* makeAsync(getAdmission).pipe(
    Effect.flatMap(envelope => decodeRpcOutcome(envelope)),
  );
  const sessionApi = yield* getApi<GatewayApi>(apiUrl)(gatewayApi =>
    gatewayApi
      .aggregate({
        publishableKey,
        systemName,
        name: aggregateName,
        version: aggregateVersion,
        actorName: aggregateSessionLock.actorName,
        actorVersion: aggregateSessionLock.actorVersion,
      })
      .admit(admission)
      .authorize({
        sessionName,
        aggregateSessionLock,
      }),
  );
  return yield* sessionApi.getSnapshot({ nodeId });
}, annotateFunctionSpan);
