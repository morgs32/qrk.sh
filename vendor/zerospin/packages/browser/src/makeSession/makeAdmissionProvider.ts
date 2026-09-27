import type {
  IAdmissionRequest,
  IIdentitySchema,
  ISessionInitialization,
} from '@zerospin/core/identity/types';
import { catchZerospinError, type IAnyError } from '@zerospin/error';
import { Effect, Schema } from 'effect';

/** Capture direct identity once; acquire fresh credentials for each server admission. */
export function makeAdmissionProvider(props: {
  identitySchema: IIdentitySchema;
  credentialsSchema?: Schema.Codec<unknown, unknown> | undefined;
  initialization: ISessionInitialization<
    IIdentitySchema,
    Schema.Codec<unknown, unknown> | undefined
  >;
}): {
  identity: Readonly<Record<string, unknown>> | undefined;
  getAdmission(): Effect.Effect<IAdmissionRequest, IAnyError>;
} {
  if (props.credentialsSchema === undefined) {
    const input = Schema.decodeUnknownSync(
      Schema.Struct({ identity: Schema.Unknown }),
      { onExcessProperty: 'error' },
    )(props.initialization);
    const identity = structuredClone(
      Schema.decodeUnknownSync(Schema.toType(props.identitySchema), {
        onExcessProperty: 'error',
      })(input.identity),
    );
    return { identity, getAdmission: () => Effect.succeed({ identity }) };
  }
  const input = Schema.decodeUnknownSync(
    Schema.Struct({
      getCredentials: Schema.declare(
        (value: unknown): value is () => Effect.Effect<unknown, IAnyError> =>
          typeof value === 'function',
      ),
    }),
    { onExcessProperty: 'error' },
  )(props.initialization);
  const credentialsSchema = props.credentialsSchema;
  return {
    identity: undefined,
    getAdmission: () =>
      Effect.suspend(input.getCredentials).pipe(
        Effect.flatMap(
          Schema.decodeUnknownEffect(Schema.toType(credentialsSchema), {
            onExcessProperty: 'error',
          }),
        ),
        Effect.map(credentials => ({ credentials })),
        Effect.mapError(
          catchZerospinError({ code: 'session-credentials-invalid' }),
        ),
      ),
  };
}
