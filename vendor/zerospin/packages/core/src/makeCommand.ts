import {
  makeZerospinError,
  mapParseError,
  type IAnyError,
} from '@zerospin/error';
import { makeAbbreviationIdSchema, type CuidFactory } from '@zerospin/schema';
import { Effect, Schema } from 'effect';

import { makeAggregateCommand } from './aggregate/make/makeAggregateCommand.ts';
import type { IAnyAuthoredAggregate } from './aggregate/types.ts';
import { makeCommand as makeContractCommand } from './contracts/make/makeCommand.ts';
import type {
  IAggregateCommand,
  ICommand,
  IServiceCommand,
} from './contracts/types.ts';
import type {
  IAggregateId,
  InferCommandPayload,
  InferPayloadInput,
} from './models/types.ts';
import type { IAnyService } from './service/types.ts';
import { getByKeyOrThrow } from './utils/getByKeyOrThrow.ts';

export function makeCommand<
  SERVICE extends IAnyService,
  CONTRACT_NAME extends keyof SERVICE['contracts'] & string,
>(
  service: SERVICE,
  props: {
    contractName: CONTRACT_NAME;
    payload: NoInfer<
      InferPayloadInput<SERVICE['contracts'][CONTRACT_NAME]['payload']>
    >;
  },
): Effect.Effect<
  IServiceCommand<
    ICommand<
      SERVICE['contracts'][CONTRACT_NAME]['commandName'],
      SERVICE['contracts'][CONTRACT_NAME]['version'],
      InferCommandPayload<SERVICE['contracts'][CONTRACT_NAME]['payload']>
    >,
    SERVICE['name']
  >,
  IAnyError,
  CuidFactory
>;
export function makeCommand<
  AGGREGATE extends IAnyAuthoredAggregate,
  ACTOR_NAME extends keyof AGGREGATE['actors'] & string,
  CONTRACT_NAME extends keyof AGGREGATE['actors'][ACTOR_NAME]['contracts'] &
    string,
  const SYSTEM_NAME extends string,
>(
  aggregate: AGGREGATE,
  props: {
    contractName: CONTRACT_NAME;
    actorName: ACTOR_NAME;
    claims: AGGREGATE['actors'][ACTOR_NAME]['identity']['claimsSchema']['Type'];
    aggregateId: IAggregateId;
    systemName: SYSTEM_NAME;
    payload: NoInfer<
      InferPayloadInput<
        AGGREGATE['actors'][ACTOR_NAME]['contracts'][CONTRACT_NAME]['payload']
      >
    >;
  },
): Effect.Effect<
  Extract<
    IAggregateCommand<
      ICommand<
        AGGREGATE['actors'][ACTOR_NAME]['contracts'][CONTRACT_NAME]['commandName'],
        AGGREGATE['actors'][ACTOR_NAME]['contracts'][CONTRACT_NAME]['version'],
        InferCommandPayload<
          AGGREGATE['actors'][ACTOR_NAME]['contracts'][CONTRACT_NAME]['payload']
        >
      >,
      AGGREGATE['name'],
      SYSTEM_NAME
    >,
    { sessionId: null }
  >,
  IAnyError,
  CuidFactory
>;
export function makeCommand(
  owner: IAnyService | IAnyAuthoredAggregate,
  props: {
    contractName: string;
    payload: InferPayloadInput<IAnyService['contracts'][string]['payload']>;
    actorName?: string;
    claims?: Readonly<Record<string, unknown>>;
    aggregateId?: IAggregateId;
    systemName?: string;
  },
): Effect.Effect<unknown, IAnyError, CuidFactory> {
  return Effect.gen(function* () {
    if ('services' in owner) {
      const input = yield* Schema.decodeUnknownEffect(
        Schema.Struct({
          actorName: Schema.String,
          claims: Schema.Record(Schema.String, Schema.Unknown),
          aggregateId: makeAbbreviationIdSchema('acct'),
          systemName: Schema.String,
        }),
      )(props).pipe(
        mapParseError({
          code: 'aggregate-command-provenance-invalid',
          prefix: 'Invalid aggregate command provenance',
        }),
      );
      const actor = yield* getByKeyOrThrow({
        record: owner.actors,
        key: input.actorName,
        recordKind: 'aggregate-actor',
      });
      const contract = yield* getByKeyOrThrow({
        record: actor.contracts,
        key: props.contractName,
        recordKind: 'actor-contract',
      });
      const claims = yield* Schema.decodeUnknownEffect(
        actor.identity.claimsSchema,
      )(input.claims).pipe(
        mapParseError({
          code: 'aggregate-command-claims-invalid',
          prefix: 'Invalid aggregate command claims',
        }),
      );
      if (claims.aggregateId !== input.aggregateId) {
        return yield* Effect.fail(
          makeZerospinError('aggregate-command-target-mismatch'),
        );
      }
      return yield* makeAggregateCommand({
        contract,
        aggregateName: owner.name,
        aggregateVersion: owner.version,
        aggregateId: input.aggregateId,
        systemName: input.systemName,
        actorName: actor.name,
        actorVersion: actor.version,
        claims,
        payload: props.payload,
      });
    }
    const selected = yield* getByKeyOrThrow({
      record: owner.contracts,
      key: props.contractName,
      recordKind: 'contracts',
    });
    const command = yield* makeContractCommand({
      contract: selected,
      payload: props.payload,
    });
    return {
      ...command,
      serviceVersion: owner.version,
      serviceName: owner.name,
    };
  });
}
