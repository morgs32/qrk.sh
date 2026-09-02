import { Effect, Schema } from 'effect';

/**
 * Validate in *Api, then invoke statically imported System Worker Effects directly.
 *
 * @bad Route same-isolate work through an exported SystemWorker RPC target or
 * `ctx.exports` resolver after GatewayApi decoded the request.
 * @bad Run `Schema.decodeUnknownEffect` on an aggregate frontend lock inside a repo
 * DO when the GatewayApi capability factory already validated it.
 */
export const getAggregateFrontendApi = Effect.fn(
  'GatewayApi.getAggregateFrontendApi',
)(function* (props: unknown) {
  const validated = yield* Schema.decodeUnknownEffect(
    AggregateFrontendApiPropsSchema,
  )(props, { onExcessProperty: 'error' }).pipe(
    mapParseError({ code: 'aggregate-frontend-api-props-invalid' }),
  );
  const authentication = yield* authenticate(validated.signature);
  const authorization = yield* authorizeAggregateFrontend({
    ...validated,
    userId: authentication.userId,
  });

  return aggregateFrontendApiFactory(authorization);
});

declare const AggregateFrontendApiPropsSchema: unknown;
declare function mapParseError(props: {
  code: string;
}): (effect: unknown) => unknown;
declare function aggregateFrontendApiFactory(props: unknown): unknown;
declare function authenticate(signature: unknown): Effect.Effect<{
  userId: string;
}>;
declare function authorizeAggregateFrontend(props: unknown): Effect.Effect<{
  aggregateId: string;
  aggregateName: string;
  userId: string;
}>;
