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
});

export function makeVersion<
  const VERSION extends string,
  SIGNATURE extends Schema.Codec<unknown, unknown>,
  USER_ID extends string,
>(props: {
  version: VERSION;
  signature: SIGNATURE;
  authenticate: (props: {
    signature: Schema.Schema.Type<SIGNATURE>;
  }) => Effect.Effect<USER_ID, IAnyError>;
}): IAuthentication<VERSION, SIGNATURE, USER_ID> {
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
    spec,
  });
}
