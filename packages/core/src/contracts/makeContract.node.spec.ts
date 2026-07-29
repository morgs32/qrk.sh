import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { makeEffectSchema } from '../models/primitiveMaps.ts';
import { primitives } from '../models/primitives.ts';
import { CuidFactory } from '../services/CuidFactory.ts';

import { makeContract } from './makeContract.ts';

describe('makeContract', () => {
  it('attaches a serializable contract spec with payload JSON Schema', () => {
    const contract = makeContract({
      commandName: 'createItem',
      version: '1.0.0',
      payload: {
        title: { kind: 'text', nullable: false, unique: false },
      },
      mutations: null,
    });

    expect(contract.spec.commandName).toBe('createItem');
    expect(contract.spec.version).toBe('1.0.0');
    expect(contract.spec.payloadJsonSchema).toMatchObject({
      type: 'object',
      properties: {
        title: { type: 'string' },
      },
    });
    expect(contract.spec.historicalDefinitions).toEqual([]);
    expect(JSON.stringify(contract.spec)).not.toContain('"program"');
  });

  it('serializes historical payload definitions deterministically without adapters', () => {
    const contract = makeContract(
      {
        commandName: 'renameItem',
        version: '3.0.0',
        payload: {
          title: primitives.text(),
        },
        mutations: null,
      },
      [
        {
          commandName: 'renameItem',
          version: '2.0.0',
          payload: {
            label: primitives.text(),
          },
          adaptPayload: ({ payload }) =>
            Effect.succeed({ title: payload.label }),
        },
        {
          commandName: 'renameItem',
          version: '1.0.0',
          payload: {
            name: primitives.text(),
          },
          adaptPayload: ({ payload }) =>
            Effect.succeed({ title: payload.name }),
        },
      ],
    );

    expect(
      contract.spec.historicalDefinitions.map(definition => definition.version),
    ).toEqual(['1.0.0', '2.0.0']);
    expect(
      contract.spec.historicalDefinitions[0]?.payloadJsonSchema,
    ).toMatchObject({
      type: 'object',
      properties: {
        name: { type: 'string' },
      },
    });
    expect(JSON.stringify(contract.spec)).not.toContain('adaptPayload');
  });

  it('adapts one decoded historical payload directly through current validation and encoding', async () => {
    const contract = makeContract(
      {
        commandName: 'renameItem',
        version: '2.0.0',
        payload: {
          title: primitives.text(),
        },
        mutations: null,
      },
      [
        {
          commandName: 'renameItem',
          version: '1.0.0',
          payload: {
            name: primitives.text(),
          },
          adaptPayload: ({ payload }) =>
            Effect.succeed({ title: payload.name }),
        },
      ],
    );
    const historicalDefinition = contract.historicalDefinitions[0];
    if (historicalDefinition === undefined) {
      throw new Error('Expected one historical definition');
    }

    const decodedHistoricalPayload = await Effect.runPromise(
      Schema.decodeUnknown(makeEffectSchema(historicalDefinition.payload))({
        name: 'Current title',
      }),
    );
    const currentPayloadInput = await Effect.runPromise(
      historicalDefinition.adaptPayload({
        payload: decodedHistoricalPayload,
      }),
    );
    const currentPayload = await Effect.runPromise(
      contract
        .validatePayload({ payload: currentPayloadInput })
        .pipe(
          Effect.provideService(CuidFactory, () =>
            Effect.succeed('unused-cuid'),
          ),
        ),
    );
    const encodedPayload = await Effect.runPromise(
      contract.encodePayload({ payload: currentPayload }),
    );

    expect(encodedPayload).toBe('{"title":"Current title"}');
  });

  it('rejects invalid, duplicate, mismatched, current, and non-older historical definitions', () => {
    const currentContract = {
      commandName: 'renameItem',
      version: '2.0.0',
      payload: {
        title: primitives.text(),
      },
      mutations: null,
    };
    const historicalDefinition = {
      commandName: 'renameItem',
      version: '1.0.0',
      payload: {
        name: primitives.text(),
      },
      adaptPayload: ({ payload }: { payload: { name: string } }) =>
        Effect.succeed({ title: payload.name }),
    };

    expect(() =>
      makeContract(
        { ...currentContract, version: 'invalid' },
        [historicalDefinition],
      ),
    ).toThrow('expected SemVer');
    expect(() =>
      makeContract(currentContract, [
        { ...historicalDefinition, version: 'invalid' },
      ]),
    ).toThrow('Invalid historical contract version "invalid"');
    expect(() =>
      makeContract(currentContract, [
        historicalDefinition,
        historicalDefinition,
      ]),
    ).toThrow('Duplicate historical contract version "1.0.0"');
    expect(() =>
      makeContract(currentContract, [
        { ...historicalDefinition, version: '2.0.0' },
      ]),
    ).toThrow('duplicates the current version');
    expect(() =>
      makeContract(currentContract, [
        { ...historicalDefinition, version: '3.0.0' },
      ]),
    ).toThrow('must be older than current version "2.0.0"');

    const mismatchedCommand = { ...historicalDefinition };
    Reflect.set(mismatchedCommand, 'commandName', 'renameSomethingElse');
    expect(() => makeContract(currentContract, [mismatchedCommand])).toThrow(
      'has commandName "renameSomethingElse", not "renameItem"',
    );

    const missingAdapter = { ...historicalDefinition };
    Reflect.deleteProperty(missingAdapter, 'adaptPayload');
    expect(() => makeContract(currentContract, [missingAdapter])).toThrow(
      'requires adaptPayload',
    );

    const invalidPayload = { ...historicalDefinition };
    Reflect.set(invalidPayload.payload, 'name', { kind: 'unsupported' });
    expect(() => makeContract(currentContract, [invalidPayload])).toThrow(
      'Invalid attribute descriptor',
    );
  });

  it('uses SemVer prerelease precedence when accepting historical versions', () => {
    expect(() =>
      makeContract(
        {
          commandName: 'renameItem',
          version: '1.0.0-beta.2',
          payload: { title: primitives.text() },
          mutations: null,
        },
        [
          {
            commandName: 'renameItem',
            version: '1.0.0-beta.1',
            payload: { name: primitives.text() },
            adaptPayload: ({ payload }) =>
              Effect.succeed({ title: payload.name }),
          },
        ],
      ),
    ).not.toThrow();
    expect(() =>
      makeContract(
        {
          commandName: 'renameItem',
          version: '1.0.0-beta.1',
          payload: { title: primitives.text() },
          mutations: null,
        },
        [
          {
            commandName: 'renameItem',
            version: '1.0.0',
            payload: { name: primitives.text() },
            adaptPayload: ({ payload }) =>
              Effect.succeed({ title: payload.name }),
          },
        ],
      ),
    ).toThrow('must be older than current version "1.0.0-beta.1"');
  });

  it('rejects a program when mutations is explicitly null', () => {
    expect(() =>
      makeContract({
        commandName: 'readItem',
        version: '1.0.0',
        payload: {
          id: { kind: 'text', nullable: false, unique: false },
        },
        mutations: null,
        // @ts-expect-error runtime validation still protects untyped callers
        program: () => {
          throw new Error('the rejected program must never run');
        },
      }),
    ).toThrow(
      'makeContract: contract "readItem" declares mutations: null and must omit program',
    );
  });
});
