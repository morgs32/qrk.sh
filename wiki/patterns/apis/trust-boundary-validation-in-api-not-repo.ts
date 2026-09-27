import { Effect, Schema } from 'effect';

/**
 * Validate in *Api, then invoke statically imported System Worker Effects directly.
 *
 * @bad Route same-isolate work through an exported SystemWorker RPC target or
 * `ctx.exports` resolver after GatewayApi decoded the request.
 * @bad Run `Schema.decodeUnknownEffect` on an aggregate definition lock inside a repo
 * DO when the GatewayApi capability factory already validated it.
 */
export const authorize = Effect.fn('AggregateAccessApi.authorize')(function* (
  props: unknown,
) {
  const validated = yield* Schema.decodeUnknownEffect(
    AggregateSessionApiPropsSchema,
  )(props, { onExcessProperty: 'error' }).pipe(
    mapParseError({ code: 'aggregate-definition-api-props-invalid' }),
  );
  const claims = yield* authenticate(validated.credentials);
  const authorization = yield* authorizeAggregateSession({
    ...validated,
    claims: claims.claims,
    aggregateId: claims.claims.aggregateId,
  });

  return aggregateSessionApiFactory(authorization);
});

declare const AggregateSessionApiPropsSchema: unknown;
declare function mapParseError(props: {
  code: string;
}): (effect: unknown) => unknown;
declare function aggregateSessionApiFactory(props: unknown): unknown;
declare function authenticate(credentials: unknown): Effect.Effect<{
  claims: { aggregateId: string; subject: string };
}>;
declare function authorizeAggregateSession(props: unknown): Effect.Effect<{
  aggregateId: string;
  aggregateName: string;
  claims: { aggregateId: string; subject: string };
}>;
