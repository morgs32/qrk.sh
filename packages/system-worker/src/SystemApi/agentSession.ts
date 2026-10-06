import { makeAggregateSessionLock } from '@zerospin/core/aggregateSession/make/makeAggregateSessionLock';
import type {
  IAggregateBrowserCommand,
  IAggregateSessionSnapshot,
} from '@zerospin/core/aggregateSession/types';
import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import {
  makeZerospinError,
  mapParseError,
  type IZerospinErrorJson,
} from '@zerospin/error';
import type { IRpcEnvelope } from '@zerospin/logger';
import { makeAbbreviationIdSchema } from '@zerospin/shapes';
import config from 'config';
import { Effect, Schema, type Context } from 'effect';

import { AggregateActorVersionChain } from '../AggregateActorVersionChain/AggregateActorVersionChain.js';
import { AggregateActorVersionRepo } from '../AggregateActorVersionRepo/AggregateActorVersionRepo.js';
import { SystemRepo } from '../SystemRepo/SystemRepo.js';

import {
  makeApiHandler,
  SystemApiAuthResults,
} from './makeApiHandler/makeApiHandler.js';
import type { SystemApi } from './SystemApi.js';

const { system } = config;

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
          const { systemId } = yield* SystemApiAuthResults;
          const systemRepo = yield* SystemRepo.getRepo({ key: { systemId } });
          return yield* makeAsync(() =>
            systemRepo.getAggregateIds({ aggregateName }),
          ).pipe(Effect.flatMap(readRpcEnvelope));
        }).pipe(
          Effect.withSpan('SystemApi.getAgentAggregateIds', { root: true }),
        ),
    })(props.request).pipe(
      Effect.provideService(SystemApiAuthResults, props.authResults),
    );
  },
);

/** Resolve an authored admin session, its snapshot and owned outcomes before granting a bounded socket. */
export const openAgentSession = Effect.fn('SystemApi.openAgentSession')(
  function* (props: {
    request: Parameters<SystemApi['openAgentSession']>[0];
    authResults: Context.Service.Shape<typeof SystemApiAuthResults>;
  }) {
    return yield* makeApiHandler({
      name: 'SystemApi.openAgentSession',
      argsSchema: Schema.mutable(
        Schema.Tuple([
          Schema.Struct({
            agentName: Schema.String,
            aggregateId: makeAbbreviationIdSchema('acct'),
            nodeId: Schema.String.check(Schema.isMinLength(1)),
          }),
        ]),
      ),
      handler: ({ agentName, aggregateId, nodeId }) =>
        Effect.gen(function* () {
          const agent = system.agents[agentName];
          if (agent === undefined) {
            return yield* Effect.fail(makeZerospinError('agent-unavailable'));
          }
          const { aggregateName, aggregateVersion, sessionName } = agent;
          const aggregate =
            system.aggregates[aggregateName]?.[aggregateVersion];
          const actor = aggregate?.actors[agent.actorName];
          if (
            actor === undefined ||
            actor.version !== agent.actorVersion ||
            actor.authentication !== 'system'
          ) {
            return yield* Effect.fail(
              makeZerospinError('agent-actor-unavailable'),
            );
          }
          const { systemId } = yield* SystemApiAuthResults;
          const systemRepo = yield* SystemRepo.getRepo({ key: { systemId } });
          const registered = yield* makeAsync(() =>
            systemRepo.hasAggregate({ aggregateName, aggregateId }),
          ).pipe(Effect.flatMap(readRpcEnvelope));
          if (!registered) {
            return yield* Effect.fail(
              makeZerospinError('agent-aggregate-not-registered'),
            );
          }
          const claims = yield* Schema.decodeUnknownEffect(
            actor.identity.claimsSchema,
          )({ aggregateId }, { onExcessProperty: 'error' }).pipe(
            mapParseError({
              code: 'agent-claims-invalid',
              prefix: 'Invalid aggregate agent claims',
            }),
          );
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
              nodeId,
            }),
          ).pipe(Effect.flatMap(readRpcEnvelope));
          const aggregateSessionLock = makeAggregateSessionLock(agent);
          const chain = yield* AggregateActorVersionChain.getRepo({ key });
          const outcomes: IAggregateBrowserCommand[] = [];
          let recoveredThrough = 0;
          while (recoveredThrough < snapshot.resolvedThrough) {
            const page = yield* makeAsync<
              Awaited<
                ReturnType<AggregateActorVersionChain['getBrowserCommands']>
              >
            >(() =>
              chain.getBrowserCommands({
                afterExecutedIndex: snapshot.executedIndex,
                throughExecutedIndex: snapshot.executedIndex,
                afterNodeIndex: recoveredThrough,
                nodeId,
                definition: {
                  name: sessionName,
                  claims,
                  lock: aggregateSessionLock,
                },
              }),
            ).pipe(Effect.flatMap(readRpcEnvelope));
            if (
              page.nodeThrough <= recoveredThrough ||
              page.nodeThrough > snapshot.resolvedThrough
            ) {
              return yield* Effect.fail(
                makeZerospinError('agent-outcome-recovery-gap'),
              );
            }
            outcomes.push(...page.commands);
            recoveredThrough = page.nodeThrough;
          }
          if (outcomes.length !== snapshot.resolvedThrough) {
            return yield* Effect.fail(
              makeZerospinError('agent-outcome-recovery-gap'),
            );
          }
          const repoName =
            yield* AggregateActorVersionChain.fixedDORepoConfig.nameUtils.makeName(
              key,
            );
          const ticket = yield* makeAsync(() =>
            systemRepo.createAggregateSessionWebSocketTicket({
              ...key,
              repoName,
              claims,
              sessionName,
              aggregateSessionLock,
            }),
          ).pipe(Effect.flatMap(readRpcEnvelope));
          return {
            snapshot: { ...snapshot, claims },
            outcomes,
            resolvedThrough: snapshot.resolvedThrough,
            ticket,
          };
        }).pipe(Effect.withSpan('SystemApi.openAgentSession', { root: true })),
    })(props.request).pipe(
      Effect.provideService(SystemApiAuthResults, props.authResults),
    );
  },
);
