import type { IAnyAggregateActorVersion } from '@zerospin/core/aggregateActor/types';
import { decodePayload } from '@zerospin/core/contracts/decodePayload/decodePayload';
import type {
  ICommand,
  IContract,
  IEncodedCommand,
} from '@zerospin/core/contracts/types';
import { makeZerospinError, mapParseError } from '@zerospin/error';
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
