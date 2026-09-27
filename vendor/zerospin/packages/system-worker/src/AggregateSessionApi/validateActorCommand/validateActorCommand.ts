import { resolveAggregateActorVersion } from '@zerospin/core/aggregateActor/getAggregateActorVersion';
import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import { encodePayload } from '@zerospin/core/contracts/encodePayload';
import { getVersion } from '@zerospin/core/contracts/getVersion';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { makeRpcEnvelope, type IRpcRequest } from '@zerospin/logger';
import config from 'config';
import { Effect, Schema } from 'effect';

import { AggregateActorVersionRepo } from '../../AggregateActorVersionRepo/AggregateActorVersionRepo.js';
import { appendTelemetryBatch } from '../../appendTelemetryBatch/appendTelemetryBatch.js';
import type { getSnapshot } from '../getSnapshot/getSnapshot.js';

export const validateActorCommand = Effect.fn(
  'AggregateSessionApi.validateActorCommand',
)(function* (props: {
  request: IRpcRequest<[{ contractName: string; payload: unknown }]>;
  authResults: Parameters<typeof getSnapshot>[0]['authResults'];
}) {
  const operation = Effect.gen(function* () {
    const [input] = yield* Schema.decodeUnknownEffect(
      Schema.Tuple([
        Schema.Struct({ contractName: Schema.String, payload: Schema.Unknown }),
      ]),
    )(props.request.args, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'validation-input-invalid',
        prefix: 'Invalid validation request',
      }),
    );
    const auth = props.authResults;
    const selected = auth.aggregateSessionLock.contracts[input.contractName];
    if (selected === undefined) {
      return yield* makeZerospinError('contract-not-found');
    }
    const actor = yield* resolveAggregateActorVersion(
      config.system.aggregates[auth.aggregateName] ?? {},
      auth,
    );
    const latest = actor.contracts[selected.commandName];
    if (latest === undefined) {
      return yield* makeZerospinError('contract-not-found');
    }
    const contract = yield* getVersion(latest, selected.version);
    const payload = yield* encodePayload(contract, {
      version: contract.version,
      payload: input.payload,
    });
    const repo = yield* AggregateActorVersionRepo.getRepo({
      key: {
        systemId: auth.systemId,
        aggregateId: auth.aggregateId,
        aggregateName: auth.aggregateName,
        aggregateVersion: auth.aggregateVersion,
        actorName: auth.actorName,
        actorVersion: auth.actorVersion,
        actorPath: auth.actorPath,
      },
    });
    const decisions = yield* makeAsync(() =>
      repo.validateCommands({
        commands: [
          {
            id: 'cmd_validation',
            commandName: contract.commandName,
            contractVersion: contract.version,
            payload,
            identity: auth.identity,
            aggregateId: auth.aggregateId,
            aggregateName: auth.aggregateName,
            aggregateVersion: auth.aggregateVersion,
            actorName: auth.actorName,
            actorVersion: auth.actorVersion,
            systemName: config.system.name,
            nodeId: null,
            sessionName: null,
            nodeIndex: null,
          },
        ],
      }),
    ).pipe(Effect.flatMap(readRpcEnvelope));
    const decision = decisions[0];
    if (decision === undefined) {
      return yield* makeZerospinError('validation-result-missing');
    }
    return decision.stagingFailure === null
      ? { _tag: 'Success' as const, success: undefined }
      : {
          _tag: 'Failure' as const,
          failure: decision.stagingFailure,
        };
  });
  const envelope = yield* operation.pipe(makeRpcEnvelope);
  yield* appendTelemetryBatch({ batch: envelope.telemetry }).pipe(
    Effect.ignore,
  );
  return { result: envelope.result, link: null };
});
