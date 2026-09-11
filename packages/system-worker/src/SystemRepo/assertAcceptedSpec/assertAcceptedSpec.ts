import { mapParseError, ZerospinError } from '@zerospin/error';
import { Effect, JsonPatch, Schema } from 'effect';

/** Compare accepted and incoming definitions and report only their changes. */
export const assertAcceptedSpec = Effect.fn('SystemRepo.assertAcceptedSpec')(
  function* (props: {
    kind: string;
    name: string;
    version: string;
    accepted: unknown;
    incoming: unknown;
  }) {
    const codec = Schema.toCodecJson(Schema.Unknown);
    const accepted = yield* Schema.encodeEffect(codec)(props.accepted).pipe(
      mapParseError({
        code: 'system-spec-invalid',
        prefix: 'Accepted spec is not JSON-compatible',
      }),
    );
    const incoming = yield* Schema.encodeEffect(codec)(props.incoming).pipe(
      mapParseError({
        code: 'system-spec-invalid',
        prefix: 'Incoming spec is not JSON-compatible',
      }),
    );
    const changes = JsonPatch.get(accepted, incoming);
    if (changes.length === 0) return;
    return yield* new ZerospinError({
      code: `${props.kind}-spec-mismatch`,
      message: `The ${props.kind} ${props.name}@${props.version} differs from its accepted spec\n${JSON.stringify(changes, null, 2)}`,
      extra: { changes },
    });
  },
);
