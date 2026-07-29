import type { IServiceFrontendState } from '@zerospin/core/serviceSession/types';
import type { IAnyErrorJson } from '@zerospin/error';
import type { ILinkedRpcEnvelope, IRpcRequest } from '@zerospin/logger';

import type { ServiceFrontendApi } from './ServiceFrontendApi';
import type { ServiceFrontendApiFailure } from './ServiceFrontendApiFailure';

declare const serviceFrontendApi: ServiceFrontendApi;
declare const failedServiceFrontendApi: ServiceFrontendApiFailure;
declare const serviceFrontendApiUnion:
  | ServiceFrontendApi
  | ServiceFrontendApiFailure;

const emptyRequest = {
  args: [],
  traceContext: null,
} satisfies IRpcRequest<[]>;

const stateEnvelope = serviceFrontendApi.getFrontendState(
  emptyRequest,
) satisfies Promise<ILinkedRpcEnvelope<IServiceFrontendState, IAnyErrorJson>>;
const ticketEnvelope = serviceFrontendApi.createFrontendWebSocketTicket(
  emptyRequest,
) satisfies Promise<
  ILinkedRpcEnvelope<
    {
      ticket: string;
      systemId: `sys_${string}`;
      generationId: string;
      serviceName: string;
      actorId: `actr_${string}`;
      actorName: string;
      frontendName: string;
      frontendVersion: string;
    },
    IAnyErrorJson
  >
>;

void stateEnvelope;
void ticketEnvelope;
void failedServiceFrontendApi.getFrontendState(emptyRequest);
void failedServiceFrontendApi.createFrontendWebSocketTicket(emptyRequest);
void serviceFrontendApiUnion.getFrontendState(emptyRequest);
void serviceFrontendApiUnion.createFrontendWebSocketTicket(emptyRequest);

// @ts-expect-error Service frontends expose no command push leaf.
void serviceFrontendApi.pushCommands;

// @ts-expect-error Service frontends expose no remote service query leaf.
void serviceFrontendApi.executeServiceQuery;

// @ts-expect-error Service frontends expose no account actor query leaf.
void serviceFrontendApi.executeActorQuery;

// @ts-expect-error Service frontends expose no account identity leaf.
void serviceFrontendApi.fetchActor;
