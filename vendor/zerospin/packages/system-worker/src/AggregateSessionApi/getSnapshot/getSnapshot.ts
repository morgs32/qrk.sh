import type { IAggregateSessionLock } from '@zerospin/core/aggregateSession/AggregateSessionLockSchema';
import type { IAggregateSessionSnapshot } from '@zerospin/core/aggregateSession/types';
import { makeAsync } from '@zerospin/core/async/make/makeAsync';
import type { IAggregateId } from '@zerospin/core/models/types';
import type { ISystemId } from '@zerospin/core/system/types';
import { readRpcEnvelope } from '@zerospin/core/utils/readRpcEnvelope';
import {
  encodeError,
  mapParseError,
  type IZerospinErrorJson,
} from '@zerospin/error';
import {
  makeRpcEnvelope,
  makeSpanLinkId,
  type IRpcEnvelope,
  type IRpcRequest,
  type ISpanLinkRecord,
} from '@zerospin/logger';
import { Effect, Exit, Result, Schema } from 'effect';

import { AggregateActorVersionRepo } from '../../AggregateActorVersionRepo/AggregateActorVersionRepo.js';
import { SystemLogRepo } from '../../SystemLogRepo/SystemLogRepo.js';

/*
 * The aggregate definition capability requests its admitted version from ActorVAR,
 * captures the node watermark, and filters the shared user graph by its lock.
 *
 * 1. Validate the request arguments.
 * 2. Return invalid arguments immediately.
 * 3. Resolve the admitted aggregate owner.
 * 4. Select the admitted version and its shared user replica.
 * 5. Collect and settle the domain operation.
 * 6. Encode the settled domain outcome.
 * 7. Persist telemetry and determine the trace link.
 * 8. Return the linked RPC envelope.
 */
export const getSnapshot = Effect.fn('AggregateSessionApi.getSnapshot')(
  function* (props: {
    request: IRpcRequest<[{ nodeId: string | null }]>;
    authResults: {
      readonly aggregateId: IAggregateId;
      readonly aggregateName: string;
      aggregateVersion: string;
      readonly identity: Readonly<Record<string, unknown>>;
      actorName: string;
      actorVersion: string;
      readonly actorPath: string;
      readonly sessionName: string;
      readonly aggregateSessionLock: IAggregateSessionLock;
      readonly systemId: ISystemId;
    };
  }) {
    const { authResults, request } = props;

    // 1 — decode request.args and reject excess fields
    const validatedArgs = yield* Schema.decodeUnknownEffect(
      Schema.toType(
        Schema.mutable(
          Schema.Tuple([
            Schema.Struct({
              nodeId: Schema.NullOr(Schema.String),
            }),
          ]),
        ),
      ),
    )(request.args, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'aggregate-session-api-arguments-invalid',
        prefix: 'AggregateSessionApi.getSnapshot received invalid arguments',
      }),
      Effect.result,
    );

    // 2 — encode the validation failure with a null trace link
    if (Result.isFailure(validatedArgs)) {
      return {
        result: yield* encodeError(validatedArgs.failure).pipe(
          Effect.map(failure => ({ _tag: 'Failure' as const, failure })),
        ),
        link: null,
      };
    }

    // 3 — bind systemId, aggregateId, and aggregateName from the capability
    const aggregateVersion = authResults.aggregateVersion;
    const aggregateSessionRepo = yield* AggregateActorVersionRepo.getRepo({
      key: {
        systemId: authResults.systemId,
        aggregateVersion,
        aggregateId: authResults.aggregateId,
        aggregateName: authResults.aggregateName,
        actorName: authResults.actorName,
        actorVersion: authResults.actorVersion,
        actorPath: authResults.actorPath,
      },
    });

    // 5 — settle the materializer getSnapshot RPC under a collected root span
    const settled = yield* makeAsync<
      IRpcEnvelope<
        Omit<IAggregateSessionSnapshot, 'identity'> & {
          actorName: string;
          actorVersion: string;
          actorPath: string;
        },
        IZerospinErrorJson
      >
    >(() =>
      aggregateSessionRepo.getSnapshot({
        aggregateId: authResults.aggregateId,
        aggregateName: authResults.aggregateName,
        actorName: authResults.actorName,
        actorVersion: authResults.actorVersion,
        actorPath: authResults.actorPath,
        sessionName: authResults.sessionName,
        identity: authResults.identity,
        nodeId: validatedArgs.success[0].nodeId,
      }),
    ).pipe(
      Effect.flatMap(envelope => readRpcEnvelope(envelope)),
      Effect.flatMap(snapshot =>
        Effect.gen(function* () {
          return {
            aggregateId: snapshot.aggregateId,
            aggregateName: snapshot.aggregateName,
            aggregateVersion: snapshot.aggregateVersion,
            actorName: snapshot.actorName,
            actorVersion: snapshot.actorVersion,
            sessionName: snapshot.sessionName,
            aggregateIndex: snapshot.aggregateIndex,
            executedIndex: snapshot.executedIndex,
            executedHash: snapshot.executedHash,
            resolvedThrough: snapshot.resolvedThrough,
            identity: authResults.identity,
            resources: snapshot.resources.filter(resource =>
              Object.hasOwn(
                authResults.aggregateSessionLock.models,
                resource.modelName,
              ),
            ),
          };
        }),
      ),
      Effect.withSpan('AggregateSessionApi.getSnapshot', { root: true }),
      makeRpcEnvelope,
    );

    // 6 — preserve success or typed failure before attempting telemetry persistence
    const result = settled.result;

    // 7 — emit a link only after persistence succeeds and the root span matches this method
    const batch = settled.telemetry;
    const persisted = yield* Effect.gen(function* () {
      const systemLogRepo = yield* SystemLogRepo.getRepo({
        key: { systemId: authResults.systemId },
      });
      return yield* makeAsync<IRpcEnvelope<void, IZerospinErrorJson>>(() =>
        systemLogRepo.appendTelemetryBatch({
          batch,
        }),
      ).pipe(Effect.flatMap(envelope => readRpcEnvelope(envelope)));
    }).pipe(Effect.exit);
    const rootSpan = batch.spans.at(-1);
    const link: ISpanLinkRecord | null =
      Exit.isSuccess(persisted) &&
      request.traceContext !== null &&
      rootSpan !== undefined &&
      rootSpan.parentSpanId === null &&
      rootSpan.name === 'AggregateSessionApi.getSnapshot'
        ? {
            linkId: makeSpanLinkId(),
            traceId: rootSpan.traceId,
            spanId: rootSpan.spanId,
            priorTraceId: request.traceContext.traceId,
            priorSpanId: request.traceContext.parentSpanId,
            kind: 'causedBy',
          }
        : null;

    // 8 — return the domain result even when no trace link can be emitted
    return { result, link };
  },
);
