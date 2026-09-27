import {
  encodeError,
  isZerospinError,
  makeZerospinError,
  mapParseError,
  PublicFailureSchema,
  recognizeZerospinError,
  type IAnyError,
  type IRecognizedFailure,
  type IScopedError,
} from '@zerospin/error';
import { Context, Effect, Schema } from 'effect';

import type { IAggregateSessionDefinition } from '../aggregateSession/types.ts';
import { runProgram } from '../execution/runProgram.ts';

import { getFailuresCodec } from './failures.ts';
import type { IContract, InferFailure } from './types.ts';

/** Codec execution cannot borrow services from the caller's runtime. */
const runFailureProgram = <A, E>(program: Effect.Effect<A, E>) =>
  runProgram(program).pipe(
    Effect.updateContext((_: Context.Context<never>) => Context.empty()),
  );

/** The same public JSON value is stored, transported, and optionally recognized. */
export type IFailure = typeof PublicFailureSchema.Type;

export const encodeFailure = (
  contract: IContract,
  failure: unknown,
): Effect.Effect<IFailure, IAnyError> =>
  isZerospinError(failure) && !('scope' in failure)
    ? encodeError(failure).pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(PublicFailureSchema)),
        mapParseError({
          code: 'failure-encoding-invalid',
          prefix: 'Invalid public failure',
        }),
      )
    : encodeBusinessFailure(contract, failure);

export const validateFailure = Effect.fn('contracts.validateFailure')(
  function* (
    contract: IContract,
    failure: unknown,
    scope?: IScopedError['scope'],
  ) {
    if (isZerospinError(failure) && !('scope' in failure)) {
      return yield* Effect.fail(failure);
    }
    if (
      Object.keys(contract.failures).length === 0 ||
      failure === null ||
      typeof failure !== 'object' ||
      !('scope' in failure) ||
      (scope !== undefined && failure.scope !== scope)
    ) {
      return yield* Effect.fail(
        makeZerospinError({
          code: 'contract-failure-undeclared',
          message: `Undeclared business failure for ${contract.commandName}@${contract.version}`,
        }),
      );
    }
    return yield* runFailureProgram(
      Schema.decodeUnknownEffect(
        Schema.toType(getFailuresCodec(contract.failures)),
      )(failure, {
        onExcessProperty: 'error',
      }).pipe(
        mapParseError({
          code: 'contract-failure-invalid',
          prefix: 'Invalid business failure',
        }),
      ),
    );
  },
);

export const encodeBusinessFailure = Effect.fn(
  'contracts.encodeBusinessFailure',
)(function* (contract: IContract, failure: unknown) {
  const value = yield* validateFailure(contract, failure);
  if (Object.keys(contract.failures).length === 0) {
    return yield* Effect.fail(makeZerospinError('contract-failure-undeclared'));
  }
  const encoded = yield* runFailureProgram(
    Schema.encodeEffect(getFailuresCodec(contract.failures))(value).pipe(
      mapParseError({
        code: 'contract-failure-encode-failed',
        prefix: 'Cannot encode business failure',
      }),
    ),
  );
  return yield* Schema.decodeUnknownEffect(PublicFailureSchema)(encoded).pipe(
    mapParseError({
      code: 'contract-failure-encoding-invalid',
      prefix: 'Failure codec must produce a public JSON error',
    }),
  );
});

/** Recognition never changes the stored or transported failure. */
export const resolveFailure = <CONTRACT extends IContract>(
  contract: CONTRACT,
  failure: IFailure,
): Effect.Effect<IRecognizedFailure<InferFailure<CONTRACT>>, IAnyError> =>
  Effect.try({
    try: () =>
      recognizeZerospinError(getFailuresCodec(contract.failures), failure),
    catch: () => makeZerospinError('contract-failure-decode-failed'),
  });

export const resolveSessionFailure = <
  DEFINITION extends IAggregateSessionDefinition,
>(
  definition: DEFINITION,
  commandName: string,
  failure: IFailure,
) => {
  const binding = Object.values(definition.contracts).find(
    binding => binding.contract.commandName === commandName,
  );
  return binding === undefined
    ? Effect.succeed(recognizeZerospinError(Schema.Never, failure))
    : resolveFailure(binding.contract, failure);
};
