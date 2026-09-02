import { primitives } from '@zerospin/schema';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { makeContract } from './makeContract.ts';

describe('makeContract', () => {
  it('attaches a serializable contract spec with payload JSON Schema', () => {
    const contract = makeContract({
      commandName: 'createItem',
      version: '1.0.0',
      payload: {
        title: primitives.text(),
      },
      mutations: null,
    });

    expect(contract.spec.commandName).toBe('createItem');
    expect(contract.spec.version).toBe('1.0.0');
    expect(contract.spec.payloadJsonSchema).toMatchObject({
      dialect: 'draft-2020-12',
      definitions: {},
      schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
        },
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
      dialect: 'draft-2020-12',
      definitions: {},
      schema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
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
    const currentPayload = await Effect.runPromise(
      contract.decodeAndAdaptPayload({
        command: {
          id: 'cmd_historical',
          commandName: 'renameItem',
          contractVersion: '1.0.0',
          payload: '{"name":"Current title"}',
        },
      }),
    );
    const encodedPayload = await Effect.runPromise(
      contract.encodePayload({ payload: currentPayload }),
    );

    expect(encodedPayload).toBe('{"title":"Current title"}');
  });

  it('decodes current payloads through the same contract-owned operation', async () => {
    const contract = makeContract({
      commandName: 'renameItem',
      version: '2.0.0',
      payload: { title: primitives.text() },
      mutations: null,
    });

    await expect(
      Effect.runPromise(
        contract.decodeAndAdaptPayload({
          command: {
            id: 'cmd_current',
            commandName: 'renameItem',
            contractVersion: '2.0.0',
            payload: '{"title":"Current title"}',
          },
        }),
      ),
    ).resolves.toEqual({ title: 'Current title' });
  });

  it('fails malformed history before adaptation and maps adapter defects or invalid output to invariants', async () => {
    let adapterCalls = 0;
    const contract = makeContract(
      {
        commandName: 'renameItem',
        version: '2.0.0',
        payload: { title: primitives.text() },
        mutations: null,
      },
      [
        {
          commandName: 'renameItem',
          version: '1.0.0',
          payload: { name: primitives.text() },
          adaptPayload: ({ payload }) =>
            Effect.sync(() => {
              adapterCalls += 1;
              return { title: payload.name };
            }),
        },
      ],
    );

    await expect(
      Effect.runPromise(
        contract.decodeAndAdaptPayload({
          command: {
            id: 'cmd_malformed',
            commandName: 'renameItem',
            contractVersion: '1.0.0',
            payload: '{"wrong":"value"}',
          },
        }),
      ),
    ).rejects.toThrow(/decode-historical-command-payload-failed/);
    expect(adapterCalls).toBe(0);

    const throwing = makeContract(
      {
        commandName: 'renameItem',
        version: '2.0.0',
        payload: { title: primitives.text() },
        mutations: null,
      },
      [
        {
          commandName: 'renameItem',
          version: '1.0.0',
          payload: { name: primitives.text() },
          adaptPayload: () => {
            throw new Error('adapter exploded');
          },
        },
      ],
    );
    await expect(
      Effect.runPromise(
        throwing.decodeAndAdaptPayload({
          command: {
            id: 'cmd_throwing',
            commandName: 'renameItem',
            contractVersion: '1.0.0',
            payload: '{"name":"Old title"}',
          },
        }),
      ),
    ).rejects.toThrow(/contract-payload-adapter-invariant-failed/);

    const invalid = makeContract(
      {
        commandName: 'renameItem',
        version: '2.0.0',
        payload: { title: primitives.text() },
        mutations: null,
      },
      [
        {
          commandName: 'renameItem',
          version: '1.0.0',
          payload: { name: primitives.text() },
          adaptPayload: ({ payload }) =>
            Effect.succeed({ title: Reflect.get(payload, 'missing') }),
        },
      ],
    );
    await expect(
      Effect.runPromise(
        invalid.decodeAndAdaptPayload({
          command: {
            id: 'cmd_invalid',
            commandName: 'renameItem',
            contractVersion: '1.0.0',
            payload: '{"name":"Old title"}',
          },
        }),
      ),
    ).rejects.toThrow(/contract-payload-adapter-output-invariant-failed/);
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
      makeContract({ ...currentContract, version: 'invalid' }, [
        historicalDefinition,
      ]),
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
          id: primitives.text(),
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
