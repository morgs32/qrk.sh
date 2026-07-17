import { ZerospinError } from '@zerospin/error';
import {
  makeRpcHandler,
  makeTraceableRpcTarget,
  type IRpcRequest,
  type ITelemetryBatch,
} from '@zerospin/logger';
import { DurableObject, env } from 'cloudflare:workers';
import { Effect, Either, Schema, Tracer } from 'effect';

// AccountRepo owns publish retry; this Durable Object is the publish target and
// owns the real deferred-delivery alarm turns. The platform discards alarm
// return values, so alarm telemetry is stored for the workerd spec to inspect.
export class AccountBlockRepo extends DurableObject {
  async publish(request: IRpcRequest<[]>) {
    const storage = this.ctx.storage;

    return Effect.runPromise(
      makeRpcHandler('AccountBlockRepo.publish')(function* () {
        const priorAttempts = yield* Effect.promise(() =>
          storage.get<number>('accountBlockPublishAttempts'),
        );
        const accountBlockPublishAttempts = (priorAttempts ?? 0) + 1;
        yield* Effect.promise(() =>
          storage.put(
            'accountBlockPublishAttempts',
            accountBlockPublishAttempts,
          ),
        );

        yield* Effect.logInfo(`publish attempt ${accountBlockPublishAttempts}`);
        const failNextAccountBlockPublish = yield* Effect.promise(() =>
          storage.get<boolean>('failNextAccountBlockPublish'),
        );
        if (failNextAccountBlockPublish === true) {
          yield* Effect.promise(() =>
            storage.delete('failNextAccountBlockPublish'),
          );
          return yield* new ZerospinError({
            code: 'mock-account-block-publish-failure',
            message: 'mock account block publish failure',
          }).pipe(Effect.mapError(Schema.encodeSync(ZerospinError.schema)));
        }

        const span = yield* Effect.currentSpan.pipe(Effect.orDie);
        yield* Effect.promise(() =>
          storage.put({
            alarmPhase: 'drain',
            alarmPrior: {
              traceId: span.traceId,
              parentSpanId: span.spanId,
            },
          }),
        );
        // Keep the alarm pending until the spec explicitly runs it. Workerd may
        // eagerly execute alarms scheduled for the current timestamp.
        yield* Effect.promise(() => storage.setAlarm(Date.now() + 60_000));
      })(request),
    );
  }

  async alarm(): Promise<void> {
    const storage = this.ctx.storage;
    const phase = await storage.get<'drain' | 'alarm'>('alarmPhase');
    const prior =
      await storage.get<Readonly<{ traceId: string; parentSpanId: string }>>(
        'alarmPrior',
      );

    if (phase === undefined || prior === undefined) {
      throw new Error('Missing persisted alarm phase or trace context');
    }

    if (phase === 'drain') {
      const wrappedActorRepo = makeTraceableRpcTarget(
        env.ACTOR_REPO.getByName('actor'),
      );
      const envelope = await Effect.runPromise(
        makeRpcHandler('AccountBlockRepo.drainActorOutbox')(function* () {
          const span = yield* Effect.currentSpan.pipe(Effect.orDie);
          span.addLinks([
            {
              _tag: 'SpanLink',
              span: Tracer.externalSpan({
                traceId: prior.traceId,
                spanId: prior.parentSpanId,
              }),
              attributes: { kind: 'causedBy' },
            },
          ]);
          yield* Effect.logInfo('drain started');
          yield* Effect.void.pipe(
            Effect.withSpan('AccountBlockRepo.refreshQueue'),
          );

          yield* Effect.gen(function* () {
            const delivery = yield* wrappedActorRepo
              .handleAccountBlocks()
              .pipe(Effect.either);

            if (Either.isLeft(delivery)) {
              const processSubscriberSpan = yield* Effect.currentSpan.pipe(
                Effect.orDie,
              );
              yield* Effect.logWarning(
                'actor delivery failed; retry scheduled for 500ms',
              );
              yield* Effect.promise(() =>
                storage.put({
                  alarmPhase: 'alarm',
                  alarmPrior: {
                    traceId: processSubscriberSpan.traceId,
                    parentSpanId: processSubscriberSpan.spanId,
                  },
                }),
              );
              yield* Effect.promise(() =>
                storage.setAlarm(Date.now() + 60_000),
              );
            }
          }).pipe(Effect.withSpan('AccountBlockRepo.processSubscriber'));
        })({ traceContext: null, args: [] }),
      );

      const telemetry =
        (await storage.get<ITelemetryBatch[]>('alarmTelemetry')) ?? [];
      await storage.put('alarmTelemetry', [...telemetry, envelope.telemetry]);
      return;
    }

    const wrappedActorRepo = makeTraceableRpcTarget(
      env.ACTOR_REPO.getByName('actor'),
    );
    const envelope = await Effect.runPromise(
      makeRpcHandler('AccountBlockRepo.alarm')(function* () {
        const span = yield* Effect.currentSpan.pipe(Effect.orDie);
        span.addLinks([
          {
            _tag: 'SpanLink',
            span: Tracer.externalSpan({
              traceId: prior.traceId,
              spanId: prior.parentSpanId,
            }),
            attributes: { kind: 'retryOf' },
          },
        ]);
        yield* Effect.logInfo('alarm fired');

        yield* Effect.gen(function* () {
          yield* Effect.void.pipe(
            Effect.withSpan('AccountBlockRepo.refreshQueue'),
          );
          yield* Effect.gen(function* () {
            const delivery = yield* wrappedActorRepo
              .handleAccountBlocks()
              .pipe(Effect.either);
            if (Either.isLeft(delivery)) {
              return yield* Effect.fail(delivery.left);
            }
          }).pipe(Effect.withSpan('AccountBlockRepo.processSubscriber'));
        }).pipe(Effect.withSpan('AccountBlockRepo.drainActorOutbox'));
      })({ traceContext: null, args: [] }),
    );

    const telemetry =
      (await storage.get<ITelemetryBatch[]>('alarmTelemetry')) ?? [];
    await storage.put('alarmTelemetry', [...telemetry, envelope.telemetry]);
    await storage.delete(['alarmPhase', 'alarmPrior']);
  }
}
