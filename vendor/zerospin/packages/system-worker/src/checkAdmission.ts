import type { IAnyAggregateActorVersion } from '@zerospin/core/aggregateActor/types';
import { decodePayload } from '@zerospin/core/contracts/decodePayload/decodePayload';
import type {
  ICommand,
  IContract,
  IEncodedCommand,
} from '@zerospin/core/contracts/types';
import { makeZerospinError, mapParseError } from '@zerospin/error';
import { Effect, Schema } from 'effect';

/** Validate the submitted payload and identity before retaining the original command. */
export const checkAdmission = Effect.fn('checkAdmission')(function* (props: {
  command: IEncodedCommand<ICommand>;
  owners: readonly {
    identity?: { identitySchema: Schema.Codec<unknown, unknown> };
    contracts: readonly IContract[];
  }[];
  identity: unknown;
  actor?: IAnyAggregateActorVersion | undefined;
}) {
  const { command, owners, actor, identity } = props;
  for (const owner of owners) {
    for (const candidate of owner.contracts) {
      if (candidate.commandName !== command.commandName) continue;
      let contract: IContract | undefined = candidate;
      while (contract !== undefined) {
        if (contract.version === command.contractVersion) break;
        contract = contract.previous;
      }
      if (contract === undefined) continue;
      yield* decodePayload(contract, { command });
      const identitySchema =
        actor === undefined
          ? owner.identity?.identitySchema
          : actor.identity.identitySchema;
      if (identity !== null && identitySchema === undefined) {
        return yield* Effect.fail(
          makeZerospinError({
            code: 'command-actor-required',
            message: 'Admitted commands require a supported actor',
          }),
        );
      }

      if (identity !== null) {
        yield* Schema.decodeUnknownEffect(identitySchema!)(identity, {
          onExcessProperty: 'error',
        }).pipe(
          mapParseError({
            code: 'command-identity-unsupported',
            prefix: 'Unsupported command identity',
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
