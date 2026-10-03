import { makeAggregateSessionLock } from '@zerospin/core/aggregateSession/make/makeAggregateSessionLock';
import type { IAggregateSessionSnapshot } from '@zerospin/core/aggregateSession/types';
import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import {
  makeZerospinError,
  mapParseError,
  type IZerospinErrorJson,
} from '@zerospin/error';
import type { IRpcEnvelope } from '@zerospin/logger';
import { makeAbbreviationIdSchema } from '@zerospin/schema';
import config from 'config';
import { Effect, Schema, type Context } from 'effect';

import { AggregateActorVersionChain } from '../AggregateActorVersionChain/AggregateActorVersionChain.js';
import { AggregateActorVersionRepo } from '../AggregateActorVersionRepo/AggregateActorVersionRepo.js';
import { AggregateChain } from '../AggregateChain/AggregateChain.js';
import { SystemRepo } from '../SystemRepo/SystemRepo.js';

import {
  makeApiHandler,
  SystemApiAuthResults,
} from './makeApiHandler/makeApiHandler.js';
import type { SystemApi } from './SystemApi.js';

const { system } = config;
const knownAggregates = Effect.fn('SystemApi.knownAggregates')(function* () {
  const { systemId } = yield* SystemApiAuthResults;
  const repo = yield* SystemRepo.getRepo({ key: { systemId } });
  const registrations = yield* makeAsync(() =>
    repo.getRepoRegistrations({ repoType: 'AggregateChain' }),
  ).pipe(Effect.flatMap(readRpcEnvelope));
  const keys = [];
  for (const registration of registrations) {
    const key = yield* AggregateChain.fixedDORepoConfig.nameUtils.parseName(
      registration.repoName,
    );
    if (key.systemId === systemId) keys.push(key);
  }
  return keys;
});

export const getAgentAggregateIds = Effect.fn('SystemApi.getAgentAggregateIds')(
  function* (props: {
    request: Parameters<SystemApi['getAgentAggregateIds']>[0];
    authResults: Context.Service.Shape<typeof SystemApiAuthResults>;
  }) {
    return yield* makeApiHandler({
      name: 'SystemApi.getAgentAggregateIds',
      argsSchema: Schema.mutable(
        Schema.Tuple([
          Schema.Struct({
            aggregateName: Schema.String,
            aggregateVersion: Schema.String,
          }),
        ]),
      ),
      handler: ({ aggregateName, aggregateVersion }) =>
        Effect.gen(function* () {
          if (
            system.aggregates[aggregateName]?.[aggregateVersion] === undefined
          ) {
            return yield* Effect.fail(
              makeZerospinError('agent-aggregate-unavailable'),
            );
          }
          return (yield* knownAggregates())
            .filter(key => key.aggregateName === aggregateName)
            .map(key => key.aggregateId);
        }).pipe(
          Effect.withSpan('SystemApi.getAgentAggregateIds', { root: true }),
        ),
    })(props.request).pipe(
      Effect.provideService(SystemApiAuthResults, props.authResults),
    );
  },
);

/** Secret-key access resolves only authored bindings; no caller-supplied actor, claims, SQL or commands. */
export const openAgentPreview = Effect.fn('SystemApi.openAgentPreview')(
  function* (props: {
    request: Parameters<SystemApi['openAgentPreview']>[0];
    authResults: Context.Service.Shape<typeof SystemApiAuthResults>;
  }) {
    return yield* makeApiHandler({
      name: 'SystemApi.openAgentPreview',
      argsSchema: Schema.mutable(
        Schema.Tuple([
          Schema.Struct({
            agentName: Schema.String,
            aggregateId: makeAbbreviationIdSchema('acct'),
          }),
        ]),
      ),
      handler: ({ agentName, aggregateId }) =>
        Effect.gen(function* () {
          const agent = system.agents[agentName];
          if (agent === undefined) {
            return yield* Effect.fail(makeZerospinError('agent-unavailable'));
          }
          const aggregateName = agent.aggregate.name;
          const aggregateVersion = agent.aggregate.version;
          if (
            !(yield* knownAggregates()).some(
              key =>
                key.aggregateName === aggregateName &&
                key.aggregateId === aggregateId,
            )
          ) {
            return yield* Effect.fail(
              makeZerospinError('agent-aggregate-not-registered'),
            );
          }
          const { systemId } = yield* SystemApiAuthResults;
          const actor = agent.actor;
          const claims = yield* Schema.decodeUnknownEffect(
            actor.identity.claimsSchema,
          )({ aggregateId }, { onExcessProperty: 'error' }).pipe(
            mapParseError({
              code: 'agent-claims-invalid',
              prefix: 'Invalid aggregate agent claims',
            }),
          );
          const sessionName = `agent:${agentName}`;
          const actorPath = '/';
          const key = {
            systemId,
            aggregateId,
            aggregateName,
            aggregateVersion,
            actorName: actor.name,
            actorVersion: actor.version,
            actorPath,
          };
          const projection = yield* AggregateActorVersionRepo.getRepo({ key });
          const snapshot = yield* makeAsync<
            IRpcEnvelope<
              Omit<IAggregateSessionSnapshot, 'claims'> & { actorPath: string },
              IZerospinErrorJson
            >
          >(() =>
            projection.getSnapshot({
              ...key,
              claims,
              sessionName,
              nodeId: null,
            }),
          ).pipe(Effect.flatMap(readRpcEnvelope));
          const aggregateSessionLock = makeAggregateSessionLock({
            kind: 'aggregate',
            modelNames: Object.keys(actor.db.models),
            aggregateName,
            aggregateVersion,
            actorName: actor.name,
            actorVersion: actor.version,
            sessionName,
            claimsSchema: actor.identity.claimsSchema,
            models: actor.db.models,
            contracts: {},
          });
          const repoName =
            yield* AggregateActorVersionChain.fixedDORepoConfig.nameUtils.makeName(
              key,
            );
          const systemRepo = yield* SystemRepo.getRepo({ key: { systemId } });
          const ticket = yield* makeAsync(() =>
            systemRepo.createAggregateSessionWebSocketTicket({
              ...key,
              repoName,
              claims,
              sessionName,
              aggregateSessionLock,
            }),
          ).pipe(Effect.flatMap(readRpcEnvelope));
          return { snapshot: { ...snapshot, claims }, ticket };
        }).pipe(Effect.withSpan('SystemApi.openAgentPreview', { root: true })),
    })(props.request).pipe(
      Effect.provideService(SystemApiAuthResults, props.authResults),
    );
  },
);
