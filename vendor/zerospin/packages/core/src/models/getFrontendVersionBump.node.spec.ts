import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';

import { encodeShape } from './encodeShape.ts';
import { getFrontendVersionBump } from './getFrontendVersionBump.ts';
import { makeModel } from './makeModel.ts';
import { primitives } from './primitives.ts';

const Team = makeModel(
  {
    abbreviation: 'team',
    modelName: 'team',
    attributes: {
      name: primitives.text(),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

const Project = makeModel(
  {
    abbreviation: 'team',
    modelName: 'project',
    attributes: {
      name: primitives.text(),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

describe('getFrontendVersionBump', () => {
  it('returns minor for identical shapes', () => {
    expect(
      getFrontendVersionBump({
        encodedOrigin: encodeShape({ propA: primitives.integer() }),
        encodedDestination: encodeShape({ propA: primitives.integer() }),
      }),
    ).toBe('minor');
  });

  it('returns major when a non-nullable field is added', () => {
    expect(
      getFrontendVersionBump({
        encodedOrigin: encodeShape({ propA: primitives.integer() }),
        encodedDestination: encodeShape({
          propA: primitives.integer(),
          propB: primitives.text(),
        }),
      }),
    ).toBe('major');
  });

  it('returns minor when a nullable field is added', () => {
    expect(
      getFrontendVersionBump({
        encodedOrigin: encodeShape({ propA: primitives.integer() }),
        encodedDestination: encodeShape({
          propA: primitives.integer(),
          propB: primitives.text({ nullable: true }),
        }),
      }),
    ).toBe('minor');
  });

  it('returns major when required defaulted scalar fields are added', () => {
    expect(
      getFrontendVersionBump({
        encodedOrigin: encodeShape({ propA: primitives.integer() }),
        encodedDestination: encodeShape({
          propA: primitives.integer(),
          propB: primitives.boolean({ defaultValue: true }),
          propC: primitives.integer({ defaultValue: 0 }),
          propD: primitives.number({ defaultValue: 1.5 }),
          propE: primitives.text({ defaultValue: 'saved' }),
          propF: primitives.date({ defaultValue: new Date(0) }),
          propG: primitives.enum({
            values: ['draft', 'published'],
            defaultValue: 'draft',
          }),
        }),
      }),
    ).toBe('major');
  });

  it('returns major when a field is removed', () => {
    expect(
      getFrontendVersionBump({
        encodedOrigin: encodeShape({
          propA: primitives.integer(),
          propB: primitives.text(),
        }),
        encodedDestination: encodeShape({ propA: primitives.integer() }),
      }),
    ).toBe('major');
  });

  it('returns minor when a field becomes nullable', () => {
    expect(
      getFrontendVersionBump({
        encodedOrigin: encodeShape({ propA: primitives.integer() }),
        encodedDestination: encodeShape({
          propA: primitives.integer({ nullable: true }),
        }),
      }),
    ).toBe('minor');
  });

  it('returns major when a field stops being nullable', () => {
    expect(
      getFrontendVersionBump({
        encodedOrigin: encodeShape({
          propA: primitives.integer({ nullable: true }),
        }),
        encodedDestination: encodeShape({ propA: primitives.integer() }),
      }),
    ).toBe('major');
  });

  it('returns major when a scalar field loses its default', () => {
    expect(
      getFrontendVersionBump({
        encodedOrigin: encodeShape({
          propA: primitives.text({ defaultValue: 'saved' }),
        }),
        encodedDestination: encodeShape({ propA: primitives.text() }),
      }),
    ).toBe('major');
  });

  it('returns minor when a scalar default value changes', () => {
    expect(
      getFrontendVersionBump({
        encodedOrigin: encodeShape({
          propA: primitives.text({ defaultValue: 'saved' }),
        }),
        encodedDestination: encodeShape({
          propA: primitives.text({ defaultValue: 'updated' }),
        }),
      }),
    ).toBe('minor');
  });

  it('returns major when a field changes kind', () => {
    expect(
      getFrontendVersionBump({
        encodedOrigin: encodeShape({ propA: primitives.integer() }),
        encodedDestination: encodeShape({ propA: primitives.text() }),
      }),
    ).toBe('major');
  });

  it('returns major when an enum value is removed', () => {
    expect(
      getFrontendVersionBump({
        encodedOrigin: encodeShape({
          status: primitives.enum({ values: ['draft', 'published'] }),
        }),
        encodedDestination: encodeShape({
          status: primitives.enum({ values: ['published'] }),
        }),
      }),
    ).toBe('major');
  });

  it('returns minor when an enum value is added', () => {
    expect(
      getFrontendVersionBump({
        encodedOrigin: encodeShape({
          status: primitives.enum({ values: ['draft'] }),
        }),
        encodedDestination: encodeShape({
          status: primitives.enum({ values: ['draft', 'published'] }),
        }),
      }),
    ).toBe('minor');
  });

  it('returns major when an opaque ID abbreviation changes', () => {
    expect(
      getFrontendVersionBump({
        encodedOrigin: encodeShape({
          userId: primitives.opaqueId({ abbreviation: 'usr' }),
        }),
        encodedDestination: encodeShape({
          userId: primitives.opaqueId({ abbreviation: 'act' }),
        }),
      }),
    ).toBe('major');
  });

  it('returns minor for matching cursor abbreviations', () => {
    expect(
      getFrontendVersionBump({
        encodedOrigin: encodeShape({
          cursor: primitives.cursor({ abbreviation: 'cur' }),
        }),
        encodedDestination: encodeShape({
          cursor: primitives.cursor({ abbreviation: 'cur' }),
        }),
      }),
    ).toBe('minor');
  });

  it('returns major when a cursor abbreviation changes', () => {
    expect(
      getFrontendVersionBump({
        encodedOrigin: encodeShape({
          cursor: primitives.cursor({ abbreviation: 'cur' }),
        }),
        encodedDestination: encodeShape({
          cursor: primitives.cursor({ abbreviation: 'next' }),
        }),
      }),
    ).toBe('major');
  });

  it('returns minor when encoded json schema metadata is equal', () => {
    expect(
      getFrontendVersionBump({
        encodedOrigin: encodeShape({
          payload: primitives.json({
            schema: Schema.Struct({
              enabled: Schema.Boolean,
            }),
          }),
        }),
        encodedDestination: encodeShape({
          payload: primitives.json({
            schema: Schema.Struct({
              enabled: Schema.Boolean,
            }),
          }),
        }),
      }),
    ).toBe('minor');
  });

  it('returns major when encoded json schema metadata changes', () => {
    expect(
      getFrontendVersionBump({
        encodedOrigin: encodeShape({
          payload: primitives.json({
            schema: Schema.Struct({
              enabled: Schema.Boolean,
            }),
          }),
        }),
        encodedDestination: encodeShape({
          payload: primitives.json({
            schema: Schema.Struct({
              enabled: Schema.String,
            }),
          }),
        }),
      }),
    ).toBe('major');
  });

  it('returns minor for matching encoded refs after the table is omitted', () => {
    expect(
      getFrontendVersionBump({
        encodedOrigin: encodeShape({
          teamId: primitives.ref({
            table: Team.table,
            relation: 'team',
            inverse: 'members',
          }),
        }),
        encodedDestination: encodeShape({
          teamId: primitives.ref({
            table: Team.table,
            relation: 'team',
            inverse: 'members',
          }),
        }),
      }),
    ).toBe('minor');
  });

  it('returns major when an encoded ref target changes', () => {
    expect(
      getFrontendVersionBump({
        encodedOrigin: encodeShape({
          ownerId: primitives.ref({
            table: Team.table,
            relation: 'owner',
            inverse: 'ownedItems',
          }),
        }),
        encodedDestination: encodeShape({
          ownerId: primitives.ref({
            table: Project.table,
            relation: 'owner',
            inverse: 'ownedItems',
          }),
        }),
      }),
    ).toBe('major');
  });

  it('returns major when an encoded ref relation name changes', () => {
    expect(
      getFrontendVersionBump({
        encodedOrigin: encodeShape({
          teamId: primitives.ref({
            table: Team.table,
            relation: 'team',
            inverse: 'members',
          }),
        }),
        encodedDestination: encodeShape({
          teamId: primitives.ref({
            table: Team.table,
            relation: 'ownerTeam',
            inverse: 'members',
          }),
        }),
      }),
    ).toBe('major');
  });
});
