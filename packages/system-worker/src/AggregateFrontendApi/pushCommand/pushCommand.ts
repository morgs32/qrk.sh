import { makeAsync } from '@zerospin/core/async/makeAsync';
import type {
  IChainedCommand,
  IEncodedCommand,
  ISessionCommand,
} from '@zerospin/core/contracts/types';
import type { AggregateFrontendLockSchema } from '@zerospin/core/frontendController/makeAggregateFrontendLock';
import type { IAggregateId } from '@zerospin/core/models/types';
import { SessionCommandSchema } from '@zerospin/core/session/AggregateFrontendCommandSchema';
import type {
  IAggregateFrontendPushedCommand,
  IFrontendDelta,
} from '@zerospin/core/session/types';
import type { ISystemId } from '@zerospin/core/system/types';
import { decodeRpc } from '@zerospin/core/utils/decodeRpc';
import { encodeRpc } from '@zerospin/core/utils/encodeRpc';
import {
  mapParseError,
  ZerospinError,
  type IAnyErrorJson,
  type IEncodedResult,
} from '@zerospin/error';
import {
  makeSpanLinkId,
  makeTelemetryCollector,
  makeTelemetryLayer,
  type IRpcRequest,
  type ISpanLinkRecord,
} from '@zerospin/logger';
import { Effect, Result, Schema } from 'effect';

import { getAggregateFrontendPushedCommandChain } from '../../AggregateFrontendPushedCommandChain/getAggregateFrontendPushedCommandChain/getAggregateFrontendPushedCommandChain.js';
import { getSystemLogRepo } from '../../SystemLogRepo/getSystemLogRepo/getSystemLogRepo.js';

export const pushCommand = Effect.fn('AggregateFrontendApi.pushCommand')(
  function* (props: {
    request: IRpcRequest<
      [
        {
          readonly command: IEncodedCommand<
            IChainedCommand<ISessionCommand, IFrontendDelta> &
              Readonly<{ sessionIndex: number; pushIndex: null }>
          >;
        },
      ]
    >;
    authResults: {
      readonly aggregateId: IAggregateId;
      readonly aggregateName: string;
      readonly userId: string;
      readonly frontendName: string;
      readonly aggregateFrontendLock: Schema.Schema.Type<
        typeof AggregateFrontendLockSchema
      >;
      readonly systemId: ISystemId;
    };
  }) {
    const { authResults, request } = props;
    const validated = yield* Schema.decodeUnknownEffect(
      Schema.toType(
        Schema.mutable(
          Schema.Tuple([
            Schema.Struct({ command: SessionCommandSchema }),
          ]),
        ),
      ),
    )(request.args, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'aggregate-frontend-api-arguments-invalid',
        prefix: 'AggregateFrontendApi.pushCommand received invalid arguments',
      }),
      Effect.result,
    );
    if (Result.isFailure(validated)) {
      return {
        result: yield* encodeRpc(Effect.fail(validated.failure)),
        link: null,
      };
    }
    const command = validated.success[0].command;
    if (
      command.aggregateId !== authResults.aggregateId ||
      command.aggregateName !== authResults.aggregateName ||
      command.userId !== authResults.userId ||
      command.frontendName !== authResults.frontendName ||
      command.systemName !== authResults.aggregateFrontendLock.systemName ||
      command.pushIndex !== null ||
      command.delta === null
    ) {
      return {
        result: yield* encodeRpc(
          Effect.fail(
            new ZerospinError({
              code: 'aggregate-frontend-command-target-mismatch',
              message:
                'Pushed command must be a terminal committed occurrence matching the admitted aggregate frontend',
            }),
          ),
        ),
        link: null,
      };
    }

    const chain = yield* getAggregateFrontendPushedCommandChain({
      key: {
        systemId: authResults.systemId,
        aggregateId: authResults.aggregateId,
        aggregateName: authResults.aggregateName,
        userId: authResults.userId,
        frontendName: authResults.frontendName,
      },
    });
    const collector = makeTelemetryCollector();
    const settled = yield* makeAsync<
      IEncodedResult<
        IEncodedCommand<IAggregateFrontendPushedCommand>,
        IAnyErrorJson
      >
    >(() =>
      chain.pushCommand({
        command,
      }),
    ).pipe(
      Effect.flatMap(decodeRpc),
      Effect.withSpan('AggregateFrontendApi.pushCommand', { root: true }),
      Effect.provide(makeTelemetryLayer(collector)),
      Effect.result,
    );
    const result = yield* Result.match(settled, {
      onFailure: error => encodeRpc(Effect.fail(error)),
      onSuccess: value => encodeRpc(Effect.succeed(value)),
    });

    const batch = collector.flush();
    const persisted = yield* Effect.gen(function* () {
      const systemLogRepo = yield* getSystemLogRepo({
        key: { systemId: authResults.systemId },
      });
      return yield* makeAsync<IEncodedResult<void, IAnyErrorJson>>(() =>
        systemLogRepo.appendTelemetryBatch({ batch }),
      ).pipe(Effect.flatMap(decodeRpc));
    }).pipe(Effect.result);
    const rootSpan = batch.spans.at(-1);
    const link: ISpanLinkRecord | null =
      Result.isSuccess(persisted) &&
      request.traceContext !== null &&
      rootSpan !== undefined &&
      rootSpan.parentSpanId === null &&
      rootSpan.name === 'AggregateFrontendApi.pushCommand'
        ? {
            linkId: makeSpanLinkId(),
            traceId: rootSpan.traceId,
            spanId: rootSpan.spanId,
            priorTraceId: request.traceContext.traceId,
            priorSpanId: request.traceContext.parentSpanId,
            kind: 'causedBy',
          }
        : null;
    return { result, link };
  },
);
