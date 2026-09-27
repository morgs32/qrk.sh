import { createHref } from '@remix-run/route-pattern/href';
import { createMatcher } from '@remix-run/route-pattern/match';
import type { IAnyService } from '@zerospin/core/service/types';
import { resolveServiceActorVersion } from '@zerospin/core/serviceActor/getServiceActorVersion';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { Effect, Schema } from 'effect';

/** Reconstruct the actor's projection identity from the canonical durable key. */
export const resolveServiceActorView = Effect.fn('resolveServiceActorView')(
  function* (
    service: IAnyService,
    key: { actorName: string; actorVersion: string; actorPath: string },
  ) {
    const actor = yield* resolveServiceActorVersion(
      { [service.version]: service },
      key,
    );
    const matched = yield* Effect.try({
      try: () =>
        createMatcher(actor.identity.pattern).match(
          new URL(key.actorPath, 'https://actor.invalid'),
        ),
      catch: () => makeZerospinError({ code: 'actor-path-invalid' }),
    });
    const selected = yield* Schema.decodeUnknownEffect(
      actor.identity.identitySchema,
    )(matched?.params, { onExcessProperty: 'error' }).pipe(
      mapParseError({
        code: 'actor-path-invalid',
        prefix: 'Invalid actor fields',
      }),
    );
    const encoded = yield* Schema.encodeEffect(actor.identity.identitySchema)(
      selected,
    ).pipe(
      mapParseError({
        code: 'actor-path-invalid',
        prefix: 'Invalid actor encoding',
      }),
    );
    const identity = yield* Schema.decodeUnknownEffect(
      Schema.Record(Schema.String, Schema.String),
    )(encoded).pipe(
      mapParseError({
        code: 'actor-path-invalid',
        prefix: 'Actor fields must be strings',
      }),
    );
    if (
      matched === null ||
      createHref(actor.identity.pattern, identity) !== key.actorPath
    ) {
      return yield* Effect.fail(
        makeZerospinError({ code: 'actor-path-noncanonical' }),
      );
    }
    return { actor, identity };
  },
);
