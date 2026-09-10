import type { IServiceFrontendState } from '@zerospin/core/serviceSession/types';
import type { IAnyErrorJson } from '@zerospin/error';
import type { ILinkedRpcEnvelope, IRpcRequest } from '@zerospin/logger';

import type { ServiceFrontendApi } from './ServiceFrontendApi.js';
import type { ServiceFrontendApiFailure } from './ServiceFrontendApiFailure/ServiceFrontendApiFailure.js';

declare const serviceFrontendApi: ServiceFrontendApi;
declare const failedServiceFrontendApi: ServiceFrontendApiFailure;
declare const serviceFrontendApiUnion:
  | ServiceFrontendApi
  | ServiceFrontendApiFailure;

const emptyRequest = {
  args: [],
  traceContext: null,
} satisfies IRpcRequest<[]>;

const stateEnvelope = serviceFrontendApi.getState(
  emptyRequest,
) satisfies Promise<ILinkedRpcEnvelope<IServiceFrontendState, IAnyErrorJson>>;
const ticketEnvelope = serviceFrontendApi.createWebSocketTicket({
  args: [{ serviceVersion: '1.0.0' }],
  traceContext: null,
}) satisfies Promise<ILinkedRpcEnvelope<{ ticket: string }, IAnyErrorJson>>;

void stateEnvelope;
void ticketEnvelope;
void failedServiceFrontendApi.getState(emptyRequest);
void failedServiceFrontendApi.createWebSocketTicket({
  args: [{ serviceVersion: '1.0.0' }],
  traceContext: null,
});
void serviceFrontendApiUnion.getState(emptyRequest);
void serviceFrontendApiUnion.createWebSocketTicket({
  args: [{ serviceVersion: '1.0.0' }],
  traceContext: null,
});

// @ts-expect-error Service frontends expose no command push leaf.
void serviceFrontendApi.pushCommand;

// @ts-expect-error Service frontends expose no remote service query leaf.
void serviceFrontendApi.executeServiceQuery;

// @ts-expect-error Service frontends expose no aggregate reference leaf.
void serviceFrontendApi.fetchActor;
