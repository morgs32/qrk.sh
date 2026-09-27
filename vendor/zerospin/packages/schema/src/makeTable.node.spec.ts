import { Effect, Schema } from 'effect';
import { describe, expect, expectTypeOf, it } from 'vitest';

import { makeTable } from './makeTable.ts';
import { primitives } from './primitives.ts';

const table = makeTable({
  name: 'events',
  shape: {
    id: primitives.primaryKey({ abbreviation: 'evt' }),
    payload: primitives.json({
      schema: Schema.Struct({ count: Schema.Number }),
    }),
    occurredAt: primitives.date(),
    title: primitives.text({ defaultValue: 'untitled' }),
    note: primitives.text({ nullable: true }),
    optionalPayload: primitives.json({
      schema: Schema.Struct({ label: Schema.String }),
      nullable: true,
      defaultValue: null,
    }),
  },
});

describe('Table row codec', () => {
  it('round trips JSON, dates, nullable values, and decoding defaults', () => {
    const occurredAt = new Date('2026-09-25T12:00:00.000Z');
    const encoded = Effect.runSync(
      table.encodeRow({
        id: 'evt_one',
        payload: { count: 2 },
        occurredAt,
        title: 'saved',
        note: null,
        optionalPayload: null,
      }),
    );
    expect(encoded.payload).toBe('{"count":2}');
    expect(encoded.occurredAt).toBe(occurredAt);
    expect(encoded.optionalPayload).toBeNull();
    expect(Effect.runSync(table.decodeRow(encoded))).toEqual({
      id: 'evt_one',
      payload: { count: 2 },
      occurredAt,
      title: 'saved',
      note: null,
      optionalPayload: null,
    });
    const { title: _, optionalPayload: __, ...withoutDefaults } = encoded;
    expect(Effect.runSync(table.decodeRow(withoutDefaults))).toMatchObject({
      title: 'untitled',
      optionalPayload: null,
    });
  });

  it('supports synchronous codecs and composed decoded schemas', () => {
    const row = {
      id: 'evt_one' as const,
      payload: { count: 2 },
      occurredAt: new Date('2026-09-25T12:00:00.000Z'),
      title: 'saved',
      note: null,
      optionalPayload: null,
    };
    const encoded = Schema.encodeSync(table.codec)(row);
    expect(encoded.payload).toBe('{"count":2}');
    expect(Schema.decodeUnknownSync(table.codec)(encoded)).toEqual(row);
    expect(
      Schema.decodeUnknownSync(table.codec.fields.payload)(encoded.payload),
    ).toEqual(row.payload);
    expect(
      Schema.decodeUnknownSync(
        Schema.Struct({ rows: Schema.Array(Schema.toType(table.codec)) }),
      )({ rows: [row] }),
    ).toEqual({ rows: [row] });
    expect(() =>
      Schema.decodeUnknownSync(table.codec)({ ...encoded, payload: '{' }),
    ).toThrow();
  });

  it('rejects malformed JSON and missing required fields', () => {
    const base = {
      id: 'evt_one',
      payload: '{"count":2}',
      occurredAt: new Date('2026-09-25T12:00:00.000Z'),
      note: null,
    };
    expect(() =>
      Effect.runSync(table.decodeRow({ ...base, payload: '{' })),
    ).toThrow();
    expect(() =>
      Effect.runSync(table.decodeRow({ ...base, id: undefined })),
    ).toThrow();
    expect(() =>
      Effect.runSync(table.decodeRow({ ...base, occurredAt: 'bad' })),
    ).toThrow();
  });

  it('keeps exact decoded and encoded row types', () => {
    expectTypeOf<{
      -readonly [K in keyof typeof table.codec.Type]: (typeof table.codec.Type)[K];
    }>().toEqualTypeOf<Effect.Success<ReturnType<typeof table.decodeRow>>>();
    expectTypeOf<{
      -readonly [K in keyof typeof table.codec.Encoded]: (typeof table.codec.Encoded)[K];
    }>().toEqualTypeOf<Effect.Success<ReturnType<typeof table.encodeRow>>>();
    expectTypeOf<
      Effect.Success<ReturnType<typeof table.decodeRow>>
    >().toEqualTypeOf<{
      id: `evt_${string}`;
      payload: { readonly count: number };
      occurredAt: Date;
      title: string;
      note: string | null;
      optionalPayload: { readonly label: string } | null;
    }>();
    expectTypeOf<
      Effect.Success<ReturnType<typeof table.encodeRow>>
    >().toEqualTypeOf<{
      id: `evt_${string}`;
      payload: string;
      occurredAt: Date;
      title: string;
      note: string | null;
      optionalPayload: string | null;
    }>();
  });

  it('builds the codec after resolving owned self references', () => {
    const nodes = makeTable({
      name: 'nodes',
      shape: {
        id: primitives.primaryKey({ abbreviation: 'nd' }),
        parentId: primitives.self({
          nullable: true,
          relation: 'parent',
          inverse: 'children',
        }),
      },
    });
    expect(
      Effect.runSync(nodes.decodeRow({ id: 'nd_one', parentId: 'nd_two' })),
    ).toEqual({
      id: 'nd_one',
      parentId: 'nd_two',
    });
    expect(
      Schema.decodeUnknownSync(nodes.codec)({
        id: 'nd_one',
        parentId: 'nd_two',
      }),
    ).toEqual({ id: 'nd_one', parentId: 'nd_two' });
    expect(() =>
      Schema.decodeUnknownSync(nodes.codec)({ id: 'nd_one', parentId: 'bad' }),
    ).toThrow();
    expect(() =>
      Effect.runSync(nodes.decodeRow({ id: 'nd_one', parentId: 'bad' })),
    ).toThrow();
  });
});
