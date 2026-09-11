import type { IAnyError } from '@zerospin/error';
import { Schema, type Effect } from 'effect';

import type { IAuthentication } from './types.ts';

export class Authentication {}

export const AuthenticationSchema = Schema.declare(
  (input: unknown): input is IAuthentication => input instanceof Authentication,
);

const MakeVersionPropsSchema = Schema.Struct({
  version: Schema.String.check(
    Schema.makeFilter(
      version =>
        /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/u.test(version) ||
        `version "${version}" must be stable SemVer major.minor.patch`,
    ),
  ),
  signature: Schema.declare(
    (input: unknown): input is Schema.Codec<unknown, unknown> =>
      Schema.isSchema(input),
  ),
  authenticate: Schema.declare(
    (
      input: unknown,
    ): input is (props: {
      signature: unknown;
    }) => Effect.Effect<string, IAnyError> => typeof input === 'function',
  ),
  onAuthentication: Schema.optional(
    Schema.declare(
      (
        input: unknown,
      ): input is NonNullable<IAuthentication['onAuthentication']> =>
        typeof input === 'function',
    ),
  ),
});

export function makeAuthenticationVersion<
  const VERSION extends string,
  SIGNATURE extends Schema.Codec<unknown, unknown>,
  IDENTITY_KEY extends string,
>(props: {
  version: VERSION;
  signature: SIGNATURE;
  authenticate: (props: {
    signature: Schema.Schema.Type<SIGNATURE>;
  }) => Effect.Effect<IDENTITY_KEY, IAnyError>;
  onAuthentication?: IAuthentication['onAuthentication'];
}): IAuthentication<VERSION, SIGNATURE, IDENTITY_KEY> {
  Schema.decodeUnknownSync(MakeVersionPropsSchema, {
    onExcessProperty: 'error',
  })(props);
  const spec = {
    version: props.version,
    signatureJsonSchema: Schema.toJsonSchemaDocument(props.signature),
  };

  return Object.assign(new Authentication(), {
    version: props.version,
    signature: props.signature,
    authenticate: props.authenticate,
    onAuthentication: props.onAuthentication,
    spec,
  });
}
