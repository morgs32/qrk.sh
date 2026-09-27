import { createHref } from '@remix-run/route-pattern/href';
import type { IAnyAggregateActorVersion } from '@zerospin/core/aggregateActor/types';
import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import type {
  IAggregateCommand,
  IEncodedCommand,
} from '@zerospin/core/contracts/types';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { Effect, Schema } from 'effect';

import { AggregateActorVersionRepo } from './AggregateActorVersionRepo.js';

/** Stage a trusted direct command before asking AC for its terminal execution result. */
export const stageDirectActorCommand = Effect.fn('stageDirectActorCommand')(
  function* (props: {
    systemId: string;
    aggregateVersion: string;
    actor: IAnyAggregateActorVersion;
    command: IEncodedCommand<IAggregateCommand>;
  }) {
    const { systemId, aggregateVersion, actor, command } = props;
    const selection = yield* Schema.decodeUnknownEffect(
      actor.identity.actorSchema,
    )(command.identity).pipe(
      mapParseError({
        code: 'actor-staging-identity-invalid',
        prefix: 'Invalid direct actor identity',
      }),
    );
    const actorPath = createHref(
      actor.identity.pattern,
      yield* Schema.decodeUnknownEffect(
        Schema.Record(Schema.String, Schema.String),
      )(selection).pipe(
        mapParseError({
          code: 'actor-staging-identity-invalid',
          prefix: 'Invalid direct actor selection',
        }),
      ),
    );
    const repo = yield* AggregateActorVersionRepo.getRepo({
      key: {
        systemId,
        aggregateId: command.aggregateId,
        aggregateName: command.aggregateName,
        aggregateVersion,
        actorName: actor.name,
        actorVersion: actor.version,
        actorPath,
      },
    });
    const staged = yield* makeAsync<
      Awaited<ReturnType<AggregateActorVersionRepo['stageCommands']>>
    >(() => repo.stageCommands({ commands: [command] })).pipe(
      Effect.flatMap(readRpcEnvelope),
      Effect.mapError(makeZerospinError),
    );
    const result = staged[0];
    if (result === undefined || result.commandId !== command.id) {
      return yield* makeZerospinError('actor-staging-result-missing');
    }
    if (result.stagingFailure !== null) {
      return yield* makeZerospinError(result.stagingFailure);
    }
  },
);
