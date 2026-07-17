import * as WebSdk from '@effect/opentelemetry/WebSdk';
import {
  BatchSpanProcessor,
  SimpleSpanProcessor,
  type ReadableSpan,
} from '@opentelemetry/sdk-trace-base';
import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { makeAsync } from '@zerospin/core/async/makeAsync';
import { ZerospinError } from '@zerospin/error';
import { Context, Effect, Layer } from 'effect';
import { groupBy } from 'es-toolkit';
import invariant from 'tiny-invariant';

import { InMemorySpanExporter } from './InMemorySpanProcessor.ts';
import { makeCallstack } from './makeCallstack.ts';
import { makeProfiles } from './makeProfiles.ts';
import { MetadataProcessor, type IMetadata } from './MetadataProcessor.ts';
import { MultiSpanProcessor } from './MultiSpanProcessor.ts';
import { StartOrderProcessor } from './StartOrderProcessor.ts';

export const ARGS_SYMBOL = Symbol('args');
export const RESULTS_SYMBOL = Symbol('results');

export class ZerospinProfile {
  public readonly id: string;
  public readonly name: string;

  constructor(
    public readonly span: ReadableSpan,
    public readonly metadata: IMetadata,
    public readonly children: ZerospinProfile[],
  ) {
    this.id = span.spanContext().spanId;
    this.name = span.name;
  }

  getArgs(): unknown[] {
    const args = this.metadata[ARGS_SYMBOL];
    if (!Array.isArray(args)) {
      throw new ZerospinError({
        code: 'invalid-profile-args',
        message: 'Args must be an array',
        extra: {
          profileId: this.id,
        },
      });
    }
    return args;
  }

  getResults(): unknown {
    return this.metadata[RESULTS_SYMBOL];
  }
}

type IProfilerOptions = {
  processor?: 'batch' | 'simple';
  sdk?: 'node' | 'web';
};

export type IProfiler = {
  addArgs: (spanId: string, args: readonly any[]) => Effect.Effect<void>;
  addResults: (spanId: string, results: unknown) => Effect.Effect<void>;
  forceFlush: () => void;
  getNthProfile: (
    fn: (...args: any[]) => any,
    index: number,
  ) => ZerospinProfile;
  getProcedure: () => ZerospinProfile[];
  reset: () => void;
};

export class Profiler extends Context.Tag('Profiler')<Profiler, IProfiler>() {}

export const makeProfilerLayer = (opts: IProfilerOptions = {}) => {
  const inMemoryExporter = new InMemorySpanExporter();
  const exporterProcessor =
    opts.processor === 'batch'
      ? new BatchSpanProcessor(inMemoryExporter)
      : new SimpleSpanProcessor(inMemoryExporter);

  const orderProcessor = new StartOrderProcessor();
  const metadataProcessor = new MetadataProcessor();
  const processor = new MultiSpanProcessor([
    orderProcessor,
    metadataProcessor,
    exporterProcessor,
  ]);

  // ── Effect ↔ OTel bridge ───────────────────────────────────────────────────
  const sdkLayer =
    opts.sdk === 'web'
      ? WebSdk.layer(() => {
          return {
            resource: { serviceName: 'zerospin' },
            spanProcessor: processor,
          };
        })
      : Layer.unwrapEffect(
          Effect.map(
            makeAsync(() => import('@effect/opentelemetry/NodeSdk')).pipe(
              Effect.provide(AsyncLive),
            ),
            nodeSdk =>
              nodeSdk.layer(() => {
                return {
                  resource: { serviceName: 'zerospin' },
                  spanProcessor: processor,
                };
              }),
          ),
        );

  const profilerLayer = Layer.succeed(Profiler, {
    addArgs: Effect.fnUntraced(function* (
      spanId: string,
      args: readonly any[],
    ) {
      yield* Effect.void;
      const store = metadataProcessor.metadataBySpanId.get(spanId);
      invariant(store);
      store.setState(state => ({
        ...state,
        [ARGS_SYMBOL]: args,
      }));
    }),
    addResults: Effect.fnUntraced(function* (spanId: string, results: unknown) {
      yield* Effect.void;
      const store = metadataProcessor.metadataBySpanId.get(spanId);
      invariant(store);
      store.setState(state => ({
        ...state,
        [RESULTS_SYMBOL]: results,
      }));
    }),
    forceFlush: () => {
      // Fire and forget - async operation but returns void
      processor.forceFlush().catch(() => {
        // Silently handle errors
      });
    },
    getNthProfile: (fn: (...args: any[]) => any, index: number) => {
      const profiles = makeProfiles({
        metadataBySpanId: metadataProcessor.metadataBySpanId,
        spans: inMemoryExporter.getFinishedSpans(),
      });
      const profilesByName = groupBy(profiles, profile => profile.name);
      const profile = profilesByName[fn.name]?.[index];
      if (!profile) {
        throw new ZerospinError({
          code: 'missing-profile',
          message: `Profile not found for function "${fn.name}"`,
          extra: {
            index,
          },
        });
      }
      return profile;
    },
    getProcedure: () => {
      return makeCallstack({
        metadataBySpanId: metadataProcessor.metadataBySpanId,
        spans: inMemoryExporter.getFinishedSpans(),
        startOrderBySpanId: orderProcessor.startOrderBySpanId,
      });
    },
    reset: () => {
      inMemoryExporter.reset();
      orderProcessor.reset();
    },
  });

  // ── Finalizer: forceFlush → freeze cache once scope ends ───────────────────
  const freezeOnReleaseLayer = Layer.scopedDiscard(
    Effect.acquireRelease(Effect.void, () => {
      return Effect.promise(async () => {
        await processor.forceFlush();
      });
    }),
  );

  const layer = Layer.mergeAll(
    Layer.fresh(sdkLayer),
    freezeOnReleaseLayer,
    profilerLayer,
  );

  return layer;
};
