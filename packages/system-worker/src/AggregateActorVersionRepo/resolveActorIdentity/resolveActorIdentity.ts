import { createHref } from '@remix-run/route-pattern/href';
import { createMatcher } from '@remix-run/route-pattern/match';
import { resolveAggregateActorVersion } from '@zerospin/core/aggregateActor/getAggregateActorVersion';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import type config from 'config';
import { Effect, Schema } from 'effect';

/** Decode a canonical actor path into the string claims used for graph actor. */
export const resolveActorIdentity = Effect.fn('resolveActorIdentity')(
  function* (props: {
    aggregate: (typeof config.system.aggregates)[string][string];
    actorName: string;
    actorVersion: string;
    actorPath: string;
  }) {
    const { aggregate, actorPath, actorName, actorVersion } = props;
    const actor = yield* resolveAggregateActorVersion(
      { [aggregate.version]: aggregate },
      { actorName, actorVersion },
    );
    const matched = yield* Effect.try({
      try: () =>
        createMatcher(actor.identity.pattern).match(
          new URL(actorPath, 'https://actor.invalid'),
        ),
      catch: () =>
        makeZerospinError({
          code: 'actor-path-invalid',
          message: 'Invalid replica actor path',
        }),
    });
    const selectedClaims = yield* Schema.decodeUnknownEffect(
      actor.identity.actorSchema,
    )(matched?.params, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'actor-path-invalid',
        prefix: 'Invalid actor fields',
      }),
    );
    const identity = yield* Schema.decodeUnknownEffect(
      Schema.Record(Schema.String, Schema.String),
    )(selectedClaims).pipe(
      mapParseError({
        code: 'actor-path-invalid',
        prefix: 'Selection fields must be strings',
      }),
    );
    if (
      matched === null ||
      createHref(actor.identity.pattern, matched.params) !== actorPath
    ) {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'actor-path-noncanonical',
          message: 'Replica actor path must be canonical',
        }),
      );
    }
    return identity;
  },
);
