import { defineContract } from '@zerospin/core/contracts/defineContract';
import { makeAsyncContract } from '@zerospin/core/contracts/make/makeAsyncContract';
import { makeContractVersion } from '@zerospin/core/contracts/make/makeContractVersion';
import { mapContractVersion } from '@zerospin/core/contracts/make/mapContractVersion';
import { defineModel } from '@zerospin/core/models/defineModel';
import { makeModelVersion } from '@zerospin/core/models/make/makeModelVersion';
import { primitives } from '@zerospin/schema';
import { Effect, Schema } from 'effect';

/**
 * Yield model operations in Effect and return a value matching the result codec.
 * The runner collects successful emissions; model methods return void.
 * Omit the result codec only when the program returns void (persisted as null).
 * Each authored version declares its own result codec; upgrades do not inherit it.
 * Collection is append-only within a run: caught failures/retries retain emissions.
 * Whole-run failure discards output. Programs and services must stay synchronous.
 * @bad Return operation arrays from the program or apply mutations while collecting.
 * @bad Retry an emission block expecting its previous emissions to be rolled back.
 */
const item = makeModelVersion(
  defineModel({ name: 'item', abbreviation: 'itm' }),
  {
    version: '1.0.0',
    attributes: { name: primitives.text() },
    indexes: [],
  },
);
export const createItem = makeContractVersion(defineContract('createItem'), {
  version: '1.0.0',
  models: { item },
  payload: {},
  result: Schema.Struct({ itemId: Schema.String }),
  program: ({ models }) =>
    Effect.gen(function* () {
      yield* models.item.create({
        resourceId: 'itm_one',
        attributes: { name: 'One' },
      });
      return { itemId: 'itm_one' };
    }),
});

/**
 * Append server output through explicit capabilities and require a mapped result codec.
 * Register the same mapped and async declarations explicitly on owner and actor.
 * Browser staging/locks use createItem; authoritative execution uses mappedCreateItem.
 * Replay records mapper emissions but applies only model operations.
 * @bad Infer async registration from capabilities or trigger producers with after.
 * @bad Derive async payloads from a source result or run producers during replay.
 */
export const asyncObserveItem = makeAsyncContract({
  name: 'asyncObserveItem',
  version: '1.0.0',
  payload: { itemId: primitives.foreignKey({ abbreviation: 'itm' }) },
  external: { result: Schema.Null, program: () => Effect.succeed(null) },
  program: () => Effect.void,
});
export const mappedCreateItem = mapContractVersion({
  contractVersion: createItem,
  operations: { models: {}, contracts: { asyncObserveItem } },
  result: Schema.Struct({ itemId: Schema.String }),
  program: ({ command, operations }) =>
    Effect.gen(function* () {
      yield* operations.contracts.asyncObserveItem({
        itemId: command.result.itemId,
      });
      return command.result;
    }),
});
export const serverContracts = {
  createItem: mappedCreateItem,
  asyncObserveItem,
};
