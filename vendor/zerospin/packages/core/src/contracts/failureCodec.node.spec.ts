import { ContractError, matchZerospinErrorCode } from '@zerospin/error';
import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { defineContract } from './defineContract.ts';
import { encodeBusinessFailure, resolveFailure } from './failureCodec.ts';
import { makeContractVersion } from './make/makeContractVersion.ts';

const expired = ContractError.schema({
  code: 'expired',
  extra: Schema.Struct({ at: Schema.DateFromString }),
});
const contract = makeContractVersion(defineContract('testFailure'), {
  version: '1.0.0',
  models: {},
  payload: {},
  failures: { expired },
  program: () => Effect.succeed([]),
});

describe('public command failures', () => {
  it('validates and encodes once, with optional current-contract recognition', async () => {
    const at = new Date('2026-09-25T12:00:00.000Z');
    const wire = await Effect.runPromise(
      encodeBusinessFailure(contract, expired.make({ extra: { at } })),
    );
    expect(wire).toMatchObject({
      _tag: 'ZerospinError',
      code: 'expired',
      scope: 'contract',
      extra: { at: at.toISOString() },
    });
    expect(wire).not.toHaveProperty('encoded');
    expect(wire).not.toHaveProperty('commandName');
    const recognized = await Effect.runPromise(resolveFailure(contract, wire));
    expect(
      matchZerospinErrorCode({
        failure: recognized,
        onMatch: { expired: failure => failure.extra.at },
        onUnknown: () => null,
      }),
    ).toEqual(at);
    expect(recognized.toJson()).toEqual(wire);
    const unfamiliar = {
      ...wire,
      code: 'introduced-later',
      extra: { nested: ['kept', 7] },
    };
    const unknown = await Effect.runPromise(
      resolveFailure(contract, unfamiliar),
    );
    expect(unknown.toJson()).toEqual(unfamiliar);
    expect(
      matchZerospinErrorCode({
        failure: unknown,
        onMatch: { expired: () => 'known' },
        onUnknown: failure => failure.code,
      }),
    ).toBe('introduced-later');
  });

  it('rejects undeclared producer failures', async () => {
    const result = await Effect.runPromise(
      encodeBusinessFailure(
        contract,
        new ContractError({ code: 'not-declared', extra: null }),
      ).pipe(Effect.result),
    );
    expect(result).toMatchObject({
      _tag: 'Failure',
      failure: { code: 'contract-failure-invalid' },
    });
  });
});
