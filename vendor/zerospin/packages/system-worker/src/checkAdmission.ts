import type { IAnyAggregateActorVersion } from '@zerospin/core/aggregateActor/types';
import { decodePayload } from '@zerospin/core/contracts/decodePayload/decodePayload';
import type {
  ICommand,
  IContract,
  IEncodedCommand,
} from '@zerospin/core/contracts/types';
import { encodeError, makeZerospinError, mapParseError } from '@zerospin/error';
import { Effect, Schema } from 'effect';

/** Validate the submitted payload and claims before retaining the original command. */
export const checkAdmission = Effect.fn('checkAdmission')(function* (props: {
  command: IEncodedCommand<ICommand>;
  owners: readonly {
    identity?: { claimsSchema: Schema.Codec<unknown, unknown> };
    contracts: readonly IContract[];
  }[];
  claims: unknown;
  actor?: IAnyAggregateActorVersion | undefined;
}) {
  const { command, owners, actor, claims } = props;
  if (command.asyncInput != null) {
    return yield* makeZerospinError('public-async-command-forbidden');
  }
  for (const owner of owners) {
    for (const candidate of owner.contracts) {
      if (candidate.commandName !== command.commandName) {
        continue;
      }
      if (candidate.async !== undefined) {
        return yield* makeZerospinError('public-async-command-forbidden');
      }
      let contract: IContract | undefined = candidate;
      while (contract !== undefined) {
        if (contract.version === command.contractVersion) {
          break;
        }
        contract = contract.previous;
      }
      if (contract === undefined) {
        continue;
      }
      yield* decodePayload(contract, { command });
      const claimsSchema =
        actor === undefined
          ? owner.identity?.claimsSchema
          : actor.identity.claimsSchema;
      if (claims !== null && claimsSchema === undefined) {
        return yield* Effect.fail(
          makeZerospinError({
            code: 'command-actor-required',
            message: 'Admitted commands require a supported actor',
          }),
        );
      }

      if (claims !== null) {
        yield* Schema.decodeUnknownEffect(claimsSchema!)(claims, {
          onExcessProperty: 'error',
        }).pipe(
          mapParseError({
            code: 'command-claims-unsupported',
            prefix: 'Unsupported command claims',
          }),
        );
      }
      return;
    }
  }
  return yield* Effect.fail(
    makeZerospinError({
      code: 'admission-contract-not-found',
      message: `Unknown submitted contract ${command.commandName}@${command.contractVersion}`,
    }),
  );
});

/** Retain a terminal rejection for valid, addressed inputs without running their program. */
export const prepareAdmissionResult = Effect.fn('prepareAdmissionResult')(
  function* (
    props: Parameters<typeof checkAdmission>[0] & { startedAt: Date },
  ) {
    const result = yield* checkAdmission(props).pipe(Effect.result);
    return result._tag === 'Failure'
      ? {
          status: 'failed' as const,
          startedAt: props.startedAt,
          completedAt: new Date(),
          failure: yield* encodeError(result.failure),
        }
      : {
          status: 'succeeded' as const,
          startedAt: props.startedAt,
          completedAt: new Date(),
        };
  },
);
