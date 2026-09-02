import { it } from '@effect/vitest';
import { Effect, Schema } from 'effect';
import { describe, expect } from 'vitest';

import { State } from './State.js';
import { makeState } from './makeState.js';

const expectSchemaFailure = (action: () => unknown): void => {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }

  expect(Schema.isSchemaError(thrown)).toBe(true);
};

const DocumentInput = {
  label: Schema.String.pipe(
    Schema.optionalKey,
    Schema.withConstructorDefault(Effect.succeed('untitled'))
  ),
  revision: Schema.Int.check(Schema.isGreaterThan(0)),
  createdAt: Schema.DateFromString
};

const Document = makeState({
  stateName: 'document',
  input: DocumentInput
});

type _Document = State<'document', typeof DocumentInput>;

const IdleInput = { count: Schema.Number };

const FirstIdle = makeState({
  stateName: 'idle',
  input: IdleInput
});

const SecondIdle = makeState({
  stateName: 'idle',
  input: IdleInput
});

describe('State', () => {
  it('is a canonical State instance with declaration fields', () => {
    expect(Document).toBeInstanceOf(State);
    expect({ ...Document }).not.toBeInstanceOf(State);
    expect(Document.stateName).toBe('document');
    expect(Document.schema).not.toBe(Document);
    expect(Document.input).toBe(DocumentInput);
    expect(typeof Document.make).toBe('function');
  });

  it('makes and decodes schema-backed values synchronously', () => {
    const createdAt = new Date('2026-08-25T12:00:00.000Z');
    const made = Document.make({ revision: 1, createdAt });
    const decoded = Schema.decodeUnknownSync(Document.schema)({
      stateName: 'document',
      label: 'decoded',
      revision: 3,
      createdAt: '2026-08-25T13:00:00.000Z'
    });

    expect(made).toEqual({
      stateName: 'document',
      label: 'untitled',
      revision: 1,
      createdAt
    });
    expect(decoded.createdAt).toEqual(new Date('2026-08-25T13:00:00.000Z'));
    expect(Schema.is(Document.schema)(made)).toBe(true);
    expect(Schema.is(Document.schema)(decoded)).toBe(true);
    expect(Schema.encodeUnknownSync(Document.schema)(made)).toEqual({
      stateName: 'document',
      label: 'untitled',
      revision: 1,
      createdAt: '2026-08-25T12:00:00.000Z'
    });
    expect(Schema.encodeUnknownSync(Document.schema)(decoded)).toEqual({
      stateName: 'document',
      label: 'decoded',
      revision: 3,
      createdAt: '2026-08-25T13:00:00.000Z'
    });
  });

  it('throws native SchemaError for invalid runtime declarations', () => {
    for (const props of [
      {},
      { stateName: 1, input: {} },
      { stateName: '__proto__', input: {} },
      { stateName: 'excess', input: {}, unexpected: true }
    ]) {
      expectSchemaFailure(() => makeState(props as any));
    }

    expectSchemaFailure(() =>
      makeState({ stateName: 'missingInput' } as any)
    );
    expectSchemaFailure(() =>
      makeState({
        stateName: 'structInput',
        input: Schema.Struct({})
      } as any)
    );
    expectSchemaFailure(() =>
      makeState({
        stateName: 'nonStructInput',
        input: Schema.String
      } as any)
    );

    for (const field of ['stateName', 'commands'] as const) {
      const state = `reserved-${field}`;
      expectSchemaFailure(() =>
        makeState({
          stateName: state,
          input: { [field]: Schema.String }
        } as any)
      );
    }
  });

  it('throws SchemaError for invalid make input', () => {
    expectSchemaFailure(() =>
      Document.make({
        revision: 0,
        createdAt: new Date('2026-08-25T12:00:00.000Z')
      })
    );
  });

  it('treats same-name State value schemas as interchangeable data', () => {
    const first = FirstIdle.make({ count: 1 });
    const second = SecondIdle.make({ count: 1 });
    const raw = { stateName: 'idle', count: 1 } as const;

    expect(Schema.is(FirstIdle.schema)(first)).toBe(true);
    expect(Schema.is(SecondIdle.schema)(second)).toBe(true);
    expect(Schema.is(FirstIdle.schema)(second)).toBe(true);
    expect(Schema.is(SecondIdle.schema)(first)).toBe(true);
    expect(Schema.is(FirstIdle.schema)(raw)).toBe(true);
    expect(Schema.is(SecondIdle.schema)(raw)).toBe(true);
  });
});
