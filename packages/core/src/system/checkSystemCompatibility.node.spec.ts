import { it } from '@effect/vitest';
import { Effect } from 'effect';
import { describe, expect } from 'vitest';

import { system } from '../fixtures/system.ts';

import { checkSystemCompatibility } from './checkSystemCompatibility.ts';
import { makeSystemSpec } from './makeSystemSpec.ts';
import type { ISystemSpec } from './types.ts';

const baseSpec: ISystemSpec = {
  systemName: 'shopping',
  version: '1.0.0',
  authentication: {
    signature: {
      version: '1.0.0',
      schemaJsonSchema: { type: 'object' },
      historicalDefinitions: [],
    },
  },
  aggregates: {
    cart: {
      name: 'cart',
      models: {},
      contracts: {},
      mutationAdapters: {},
      selections: {},
      queries: {},
      frontends: {},
    },
  },
  services: {},
};

describe('checkSystemCompatibility', () => {
  it.effect('returns no bump for identical consolidated specs', () =>
    Effect.gen(function* () {
      const result = yield* checkSystemCompatibility({
        prior: baseSpec,
        next: structuredClone(baseSpec),
      });

      expect(result).toEqual({
        requiredBump: 'none',
        diffs: [],
        missingAdapters: [],
        requiresNewGeneration: false,
      });
    }),
  );

  it.effect('classifies an added service as a minor generation change', () =>
    Effect.gen(function* () {
      const next = structuredClone(baseSpec);
      next.version = '1.1.0';
      next.services.catalog = {
        name: 'catalog',
        models: {},
        contracts: {},
        mutationAdapters: {},
        queries: {},
        frontends: {},
      };

      const result = yield* checkSystemCompatibility({
        prior: baseSpec,
        next,
      });

      expect(result.requiredBump).toBe('minor');
      expect(result.requiresNewGeneration).toBe(true);
      expect(result.diffs).toContainEqual(
        expect.objectContaining({
          path: 'services.catalog',
          kind: 'surface-added',
          requiredBump: 'minor',
        }),
      );
    }),
  );

  it.effect('requires a major bump when an aggregate is removed', () =>
    Effect.gen(function* () {
      const next = structuredClone(baseSpec);
      next.version = '2.0.0';
      Reflect.deleteProperty(next.aggregates, 'cart');

      const result = yield* checkSystemCompatibility({
        prior: baseSpec,
        next,
      });

      expect(result.requiredBump).toBe('major');
      expect(result.requiresNewGeneration).toBe(true);
      expect(result.diffs).toContainEqual(
        expect.objectContaining({
          path: 'aggregates.cart',
          kind: 'surface-removed',
          requiredBump: 'major',
        }),
      );
    }),
  );

  it.effect('reports an under-bumped authored system version', () =>
    Effect.gen(function* () {
      const next = structuredClone(baseSpec);
      next.services.catalog = {
        name: 'catalog',
        models: {},
        contracts: {},
        mutationAdapters: {},
        queries: {},
        frontends: {},
      };

      const result = yield* checkSystemCompatibility({
        prior: baseSpec,
        next,
      });

      expect(result.diffs).toContainEqual(
        expect.objectContaining({
          path: 'version',
          kind: 'version-under-bumped',
          requiredBump: 'minor',
        }),
      );
    }),
  );

  it.effect('rejects mutation of the current authentication definition', () =>
    Effect.gen(function* () {
      const prior = makeSystemSpec({ system });
      const next = structuredClone(prior);
      next.authentication.signature.schemaJsonSchema = { type: 'string' };

      const result = yield* checkSystemCompatibility({ prior, next });

      expect(result.diffs).toContainEqual(
        expect.objectContaining({
          path: 'authentication.signature.1.0.0',
          kind: 'authentication-exact-definition-mutated',
        }),
      );
      expect(result.requiresNewGeneration).toBe(false);
    }),
  );

  it.effect('rejects removal of retained authentication history', () =>
    Effect.gen(function* () {
      const prior = makeSystemSpec({ system });
      const next = structuredClone(prior);
      next.authentication.signature.historicalDefinitions = [
        {
          version: '0.9.0',
          schemaJsonSchema: { type: 'string' },
          hasDirectAdapter: true,
        },
      ];
      const withHistory = structuredClone(next);
      next.authentication.signature.historicalDefinitions = [];

      const result = yield* checkSystemCompatibility({
        prior: withHistory,
        next,
      });

      expect(result.diffs).toContainEqual(
        expect.objectContaining({
          path: 'authentication.signature',
          kind: 'definition-history-removed',
          requiredBump: 'none',
        }),
      );
    }),
  );

  it.effect(
    'records frontend lock support change when an exact lock changes',
    () =>
      Effect.gen(function* () {
        const prior = makeSystemSpec({ system });
        const next = structuredClone(prior);
        const controller = next.aggregates.user.frontends.main.controller;
        controller.aggregateFrontendLock.frontendName = 'renamed';

        const result = yield* checkSystemCompatibility({ prior, next });

        expect(result.diffs).toContainEqual(
          expect.objectContaining({
            path: 'aggregates.user.frontends',
            kind: 'frontend-lock-support-changed',
          }),
        );
      }),
  );

  it.effect(
    'rejects mutation of a retained authentication definition after a version bump',
    () =>
      Effect.gen(function* () {
        const prior = makeSystemSpec({ system });
        prior.authentication.signature.historicalDefinitions = [
          {
            version: '0.9.0',
            schemaJsonSchema: { type: 'string' },
            hasDirectAdapter: true,
          },
        ];
        const next = structuredClone(prior);
        next.authentication.signature.historicalDefinitions[0] = {
          version: '0.9.0',
          schemaJsonSchema: { type: 'number' },
          hasDirectAdapter: true,
        };

        const result = yield* checkSystemCompatibility({ prior, next });

        expect(result.diffs).toContainEqual(
          expect.objectContaining({
            path: 'authentication.signature.0.9.0',
            kind: 'authentication-exact-definition-mutated',
          }),
        );
      }),
  );
});
