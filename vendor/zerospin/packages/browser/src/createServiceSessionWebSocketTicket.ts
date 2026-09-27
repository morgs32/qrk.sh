import type { Async } from '@zerospin/core/async/Async';
import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import type { IAdmissionRequest } from '@zerospin/core/identity/types';
import type { IServiceSessionLock } from '@zerospin/core/serviceSession/ServiceSessionLockSchema';
import { decodeRpcOutcome } from '@zerospin/core/utils/decodeRpcOutcome';
import { getApi } from '@zerospin/core/utils/getApi/getApi';
import type { IAnyError, IResult, IZerospinErrorJson } from '@zerospin/error';
import {
  annotateFunctionSpan,
  type TelemetryCollector,
} from '@zerospin/logger';
import { Effect } from 'effect';
import type { GatewayApi } from 'system-worker/GatewayApi/GatewayApi';

export const createServiceSessionWebSocketTicket = Effect.fn(
  'createServiceSessionWebSocketTicket',
)(function* (props: {
  apiUrl: string;
  publishableKey: string;
  systemName: string;
  getAdmission(): Promise<
    IResult<IAdmissionRequest, IAnyError | IZerospinErrorJson>
  >;
  serviceName: string;
  serviceVersion: string;
  sessionName: string;
  serviceSessionLock: IServiceSessionLock;
}): Effect.fn.Return<
  Readonly<{ ticket: string }>,
  IAnyError | IZerospinErrorJson,
  Async | TelemetryCollector
> {
  const {
    apiUrl,
    sessionName,
    getAdmission,
    publishableKey,
    serviceSessionLock,
    serviceName,
    systemName,
    serviceVersion,
  } = props;
  const request = yield* makeAsync(getAdmission).pipe(
    Effect.flatMap(envelope => decodeRpcOutcome(envelope)),
  );
  const sessionApi = yield* getApi<GatewayApi>(apiUrl)(gatewayApi =>
    gatewayApi
      .service({
        publishableKey,
        systemName,
        name: serviceName,
        version: serviceVersion,
      })
      .admit({
        ...request,
        actorName: serviceSessionLock.actorName,
        actorVersion: serviceSessionLock.actorVersion,
      })
      .authorize({
        sessionName,
        serviceSessionLock,
      }),
  );
  return yield* sessionApi.createWebSocketTicket({
    serviceVersion,
  });
}, annotateFunctionSpan);
