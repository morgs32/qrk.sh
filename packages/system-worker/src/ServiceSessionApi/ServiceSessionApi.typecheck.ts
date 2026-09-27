import type { IServiceSessionSnapshot } from '@zerospin/core/serviceSession/types';
import type { IZerospinErrorJson } from '@zerospin/error';
import type { ILinkedRpcEnvelope, IRpcRequest } from '@zerospin/logger';

import type { ServiceSessionApi } from './ServiceSessionApi.js';
import type { ServiceSessionApiFailure } from './ServiceSessionApiFailure/ServiceSessionApiFailure.js';

declare const serviceSessionApi: ServiceSessionApi;
declare const failedServiceSessionApi: ServiceSessionApiFailure;
declare const serviceSessionApiUnion:
  | ServiceSessionApi
  | ServiceSessionApiFailure;

const emptyRequest = {
  args: [],
  traceContext: null,
} satisfies IRpcRequest<[]>;

const stateEnvelope = serviceSessionApi.getSnapshot(
  emptyRequest,
) satisfies Promise<
  ILinkedRpcEnvelope<IServiceSessionSnapshot, IZerospinErrorJson>
>;
const ticketEnvelope = serviceSessionApi.createWebSocketTicket({
  args: [{ serviceVersion: '1.0.0' }],
  traceContext: null,
}) satisfies Promise<
  ILinkedRpcEnvelope<{ ticket: string }, IZerospinErrorJson>
>;

void stateEnvelope;
void ticketEnvelope;
void failedServiceSessionApi.getSnapshot(emptyRequest);
void failedServiceSessionApi.createWebSocketTicket({
  args: [{ serviceVersion: '1.0.0' }],
  traceContext: null,
});
void serviceSessionApiUnion.getSnapshot(emptyRequest);
void serviceSessionApiUnion.createWebSocketTicket({
  args: [{ serviceVersion: '1.0.0' }],
  traceContext: null,
});

// @ts-expect-error Service sessions expose no command push leaf.
void serviceSessionApi.pushCommand;

// @ts-expect-error Service sessions expose no remote service query leaf.
void serviceSessionApi.executeServiceQuery;

// @ts-expect-error Service sessions expose no aggregate reference leaf.
void serviceSessionApi.fetchActor;
