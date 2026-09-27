import type {
  IAdmissionRequest,
  IClaimsSchema,
  ISessionInitialization,
} from '@zerospin/core/identity/types';
import { catchZerospinError, type IAnyError } from '@zerospin/error';
import { Effect, Schema } from 'effect';

/** Capture direct claims once; acquire fresh credentials for each server admission. */
export function makeAdmissionProvider(props: {
  claimsSchema: IClaimsSchema;
  credentialsSchema?: Schema.Codec<unknown, unknown> | undefined;
  initialization: ISessionInitialization<
    IClaimsSchema,
    Schema.Codec<unknown, unknown> | undefined
  >;
}): {
  claims: Readonly<Record<string, unknown>> | undefined;
  getAdmission(): Effect.Effect<IAdmissionRequest, IAnyError>;
} {
  if (props.credentialsSchema === undefined) {
    const input = Schema.decodeUnknownSync(
      Schema.Struct({ claims: Schema.Unknown }),
      { onExcessProperty: 'error' },
    )(props.initialization);
    const claims = structuredClone(
      Schema.decodeUnknownSync(Schema.toType(props.claimsSchema), {
        onExcessProperty: 'error',
      })(input.claims),
    );
    return { claims, getAdmission: () => Effect.succeed({ claims }) };
  }
  const input = Schema.decodeUnknownSync(
    Schema.Struct({
      expectedClaims: Schema.optional(Schema.toType(props.claimsSchema)),
      getCredentials: Schema.declare(
        (value: unknown): value is () => Effect.Effect<unknown, IAnyError> =>
          typeof value === 'function',
      ),
    }),
    { onExcessProperty: 'error' },
  )(props.initialization);
  const credentialsSchema = props.credentialsSchema;
  return {
    claims:
      input.expectedClaims === undefined
        ? undefined
        : structuredClone(input.expectedClaims),
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
