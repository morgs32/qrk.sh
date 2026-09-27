import { type IScopedError } from '@zerospin/error';
import { Schema, SchemaAST } from 'effect';

export type IFailureSchema = Schema.Codec<IScopedError, unknown> & {
  readonly make: (...args: never[]) => IScopedError;
};
export type IFailures = Readonly<Record<string, IFailureSchema>>;
export type FailureType<F extends IFailures> = F[keyof F]['Type'];
export type FailureJson<F extends IFailures> = F[keyof F]['Encoded'];

export const FailuresSchema = Schema.declare(
  (input: unknown): input is IFailures => {
    if (
      input === null ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      Schema.isSchema(input)
    ) {
      return false;
    }
    const codes = new Set<string>();
    return Object.entries(input).every(([key, value]) => {
      if (
        !/^[a-z][a-zA-Z0-9]*$/.test(key) ||
        !Schema.isSchema(value) ||
        !('make' in value) ||
        typeof value.make !== 'function'
      ) {
        return false;
      }
      const ast = SchemaAST.toEncoded(value.ast);
      if (ast._tag !== 'Objects') return false;
      const code = ast.propertySignatures.find(p => p.name === 'code');
      const scope = ast.propertySignatures.find(p => p.name === 'scope');
      if (
        !code ||
        code.type.context?.isOptional ||
        code.type._tag !== 'Literal' ||
        typeof code.type.literal !== 'string' ||
        codes.has(code.type.literal)
      ) {
        return false;
      }
      if (
        !scope ||
        scope.type.context?.isOptional ||
        scope.type._tag !== 'Literal' ||
        !['contract', 'actor', 'aggregate'].includes(String(scope.type.literal))
      ) {
        return false;
      }
      codes.add(code.type.literal);
      return true;
    });
  },
  {
    expected:
      'A camelCase record of scoped error schemas with unique literal codes',
  },
);

const codecs = new WeakMap<IFailures, Schema.Codec<IScopedError, unknown>>();

/** The record owns one derived codec; inherited declarations reuse it. */
export function getFailuresCodec<F extends IFailures>(
  failures: F,
): Schema.Codec<FailureType<F>, FailureJson<F>>;
export function getFailuresCodec(failures: IFailures) {
  let codec = codecs.get(failures);
  if (codec === undefined) {
    codec = Schema.Union(Object.values(failures));
    codecs.set(failures, codec);
  }
  return codec;
}
