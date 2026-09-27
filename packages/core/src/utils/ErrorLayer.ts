/* eslint-disable no-console */
import { isZerospinError } from '@zerospin/error';
import { Effect, Exit, Layer, Option, Tracer } from 'effect';

const makeTracer: Effect.Effect<Tracer.Tracer> = Effect.gen(function* () {
  const currentTracer = yield* Effect.tracer;

  const spans: {
    attributes: Record<string, unknown>;
    name: string;
    stacktrace: string[];
  }[] = [];

  return Tracer.make({
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Copied this from the Discord
    context: currentTracer.context,
    span: options => {
      const span = currentTracer.span(options);

      const oldEnd = span.end.bind(span);
      span.end = function (
        this: unknown,
        ...args: Parameters<typeof span.end>
      ) {
        const [_, exit] = args;
        oldEnd.apply(this, args);
        if (Exit.isFailure(exit)) {
          const { 'code.stacktrace': _, ...attributes } = Object.fromEntries(
            span.attributes,
          );

          const stacktraceAttr = span.attributes.get('code.stacktrace');
          // Explicit spans need not have the function stack metadata attached by Effect.fn.
          // Tracing must preserve the original failure even when that metadata is absent.
          const stacktrace =
            typeof stacktraceAttr === 'string'
              ? stacktraceAttr.replaceAll(/\(|\)/g, '').split('\n')
              : [];
          spans.push({
            attributes,
            name: span.name,
            stacktrace,
          });
          if (Option.isNone(span.parent)) {
            Exit.mapError(exit, error => {
              if (
                isZerospinError(error) &&
                !('scope' in error) &&
                (error.extra === null ||
                  (typeof error.extra === 'object' &&
                    !Array.isArray(error.extra)))
              ) {
                // @ts-expect-error mutating structured error metadata for tracing.
                error.extra = {
                  ...error.extra,
                  spans,
                };
              }
              return error;
            });
          }
        }
      };

      return span;
    },
  });
}).pipe(
  Effect.withSpan('ErrorLayer.makeTracer'),
  Effect.annotateLogs({
    package: 'zerospin',
  }),
  Effect.tapError(error => Effect.logError(error)), // Log errors during construction
);

export const ErrorLayer = makeTracer.pipe(
  Effect.map(tracer => Layer.succeed(Tracer.Tracer, tracer)),
  Layer.unwrap,
);
