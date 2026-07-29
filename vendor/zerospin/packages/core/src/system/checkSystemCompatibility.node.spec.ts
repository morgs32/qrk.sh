import { it } from '@effect/vitest';
import { Effect, JSONSchema, Schema } from 'effect';
import { describe, expect } from 'vitest';

import { makeContract } from '../contracts/makeContract.ts';
import { system as fixtureSystem, User } from '../fixtures/system.ts';
import { makeModelIdSchema } from '../models/makeIdSchema.ts';
import { makeServiceModel } from '../models/makeServiceModel.ts';
import { primitives } from '../models/primitives.ts';
import { makeServiceController } from '../service/makeServiceController.ts';

import { checkSystemCompatibility } from './checkSystemCompatibility.ts';
import { makeSystem } from './makeSystem.ts';
import { makeSystemSpec } from './makeSystemSpec.ts';

const Product = makeServiceModel(
  {
    serviceName: 'app',
    abbreviation: 'prd',
    modelName: 'product',
    attributes: { name: primitives.text() },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

const createProduct = makeContract({
  commandName: 'createProduct',
  payload: {
    id: Product.primaryKey({ autogenerate: false }),
    name: primitives.text(),
  },
  mutations: Schema.Struct({
    created: Product.createMutation('1.0.0'),
  }),
  program: ({ payload }) =>
    Effect.all({
      created: Product.create('1.0.0', {
        resourceId: payload.id,
        attributes: { name: payload.name },
      }),
    }),
  version: '1.0.0',
});

const appService = makeServiceController({
  name: 'app',
  version: '1.0.0',
  models: { product: Product },
  contracts: { createProduct },
  queries: {
    findProducts: {
      paramsSchema: Schema.Struct({ name: Schema.String }),
      query: () => Effect.succeed([]),
    },
  },
});

const baseSpec = makeSystemSpec({
  system: makeSystem({
    name: 'shopping',
    version: '1.0.0',
    accountControllers: {},
    serviceControllers: { app: appService },
  }),
});

describe('checkSystemCompatibility', () => {
  it.effect('returns no structural bump for identical complete specs', () =>
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

  it.effect(
    'classifies nullable model additions as minor and creates a generation',
    () =>
      Effect.gen(function* () {
        const next = structuredClone(baseSpec);
        next.version = '1.1.0';
        next.serviceControllers.app!.version = '1.1.0';
        const nextModel = next.serviceControllers.app!.models.product!;
        nextModel.version = '1.1.0';
        nextModel.properties = {
          ...nextModel.properties,
          note: primitives.text({ nullable: true }),
        };

        const result = yield* checkSystemCompatibility({
          prior: baseSpec,
          next,
        });

        expect(result.requiredBump).toBe('minor');
        expect(result.requiresNewGeneration).toBe(true);
        expect(result.missingAdapters).toEqual([]);
        expect(result.diffs).toContainEqual(
          expect.objectContaining({
            path: 'serviceControllers.app.models.product.properties.note',
            kind: 'property-added',
            requiredBump: 'minor',
          }),
        );
        expect(
          result.diffs.some(diff => diff.kind === 'version-under-bumped'),
        ).toBe(false);
      }),
  );

  it.effect(
    'requires direct create and replication adapters for a required model addition',
    () =>
      Effect.gen(function* () {
        const next = structuredClone(baseSpec);
        next.version = '2.0.0';
        next.serviceControllers.app!.version = '2.0.0';
        const nextModel = next.serviceControllers.app!.models.product!;
        nextModel.version = '2.0.0';
        nextModel.properties = {
          ...nextModel.properties,
          sku: primitives.text(),
        };

        const missing = yield* checkSystemCompatibility({
          prior: baseSpec,
          next,
        });
        expect(missing.requiredBump).toBe('major');
        expect(missing.missingAdapters).toEqual([
          {
            controllerKind: 'service',
            controllerName: 'app',
            modelName: 'product',
            modelVersion: '1.0.0',
            operationName: 'create',
          },
          {
            controllerKind: 'service',
            controllerName: 'app',
            modelName: 'product',
            modelVersion: '1.0.0',
            operationName: 'replicateResource',
          },
        ]);

        next.serviceControllers.app!.mutationAdapters.product = {
          create: [
            {
              source: {
                modelName: 'product',
                modelVersion: '1.0.0',
                operationName: 'create',
                jsonSchema: {},
              },
              destination: {
                modelName: 'product',
                modelVersion: '2.0.0',
                operationName: 'create',
                jsonSchema: {},
              },
            },
          ],
          replicateResource: [
            {
              source: {
                modelName: 'product',
                modelVersion: '1.0.0',
                operationName: 'replicateResource',
                jsonSchema: {},
              },
              destination: null,
            },
          ],
        };
        const covered = yield* checkSystemCompatibility({
          prior: baseSpec,
          next,
        });
        expect(covered.missingAdapters).toEqual([]);
      }),
  );

  it.effect('applies the exact non-unique and unique index rules', () =>
    Effect.gen(function* () {
      const minorNext = structuredClone(baseSpec);
      minorNext.version = '1.1.0';
      minorNext.serviceControllers.app!.version = '1.1.0';
      minorNext.serviceControllers.app!.models.product!.version = '1.1.0';
      minorNext.serviceControllers.app!.models.product!.indexes = [
        { name: 'product_name', columns: ['name'] },
      ];
      const minor = yield* checkSystemCompatibility({
        prior: baseSpec,
        next: minorNext,
      });
      expect(minor.requiredBump).toBe('minor');

      const majorNext = structuredClone(baseSpec);
      majorNext.version = '2.0.0';
      majorNext.serviceControllers.app!.version = '2.0.0';
      majorNext.serviceControllers.app!.models.product!.version = '2.0.0';
      majorNext.serviceControllers.app!.models.product!.indexes = [
        { name: 'product_name', columns: ['name'], unique: true },
      ];
      const major = yield* checkSystemCompatibility({
        prior: baseSpec,
        next: majorNext,
      });
      expect(major.requiredBump).toBe('major');
      expect(major.missingAdapters).toEqual([]);
    }),
  );

  it.effect('uses directional payload and query parameter compatibility', () =>
    Effect.gen(function* () {
      const prior = structuredClone(baseSpec);
      prior.serviceControllers.app!.contracts.createProduct!.payloadJsonSchema =
        JSONSchema.make(Schema.Struct({ id: Schema.String }));
      prior.serviceControllers.app!.queries.findProducts!.paramsJsonSchema =
        JSONSchema.make(Schema.Struct({ name: Schema.String }));

      const widened = structuredClone(prior);
      widened.version = '1.1.0';
      widened.serviceControllers.app!.version = '1.1.0';
      widened.serviceControllers.app!.contracts.createProduct!.version =
        '1.1.0';
      widened.serviceControllers.app!.contracts.createProduct!.payloadJsonSchema =
        JSONSchema.make(
          Schema.Struct({
            id: Schema.String,
            note: Schema.optional(Schema.String),
          }),
        );
      widened.serviceControllers.app!.queries.findProducts!.paramsJsonSchema =
        JSONSchema.make(
          Schema.Struct({
            name: Schema.String,
            limit: Schema.optional(Schema.Number),
          }),
        );
      const compatible = yield* checkSystemCompatibility({
        prior,
        next: widened,
      });
      expect(compatible.requiredBump).toBe('minor');
      expect(
        compatible.diffs.filter(diff => diff.kind === 'schema-widened'),
      ).toHaveLength(2);

      const narrowed = structuredClone(prior);
      narrowed.version = '2.0.0';
      narrowed.serviceControllers.app!.version = '2.0.0';
      narrowed.serviceControllers.app!.contracts.createProduct!.version =
        '2.0.0';
      narrowed.serviceControllers.app!.contracts.createProduct!.payloadJsonSchema =
        JSONSchema.make(
          Schema.Struct({ id: Schema.String, required: Schema.String }),
        );
      const incompatible = yield* checkSystemCompatibility({
        prior,
        next: narrowed,
      });
      expect(incompatible.requiredBump).toBe('major');
      expect(incompatible.diffs).toContainEqual(
        expect.objectContaining({
          path: 'serviceControllers.app.contracts.createProduct.payloadJsonSchema',
          kind: 'schema-incompatible',
        }),
      );
    }),
  );

  it.effect(
    'classifies historical contract payload additions, removals, and schema direction without a generation',
    () =>
      Effect.gen(function* () {
        const added = structuredClone(baseSpec);
        added.version = '1.1.0';
        added.serviceControllers.app!.version = '1.1.0';
        added.serviceControllers.app!.contracts.createProduct!.version =
          '1.1.0';
        added.serviceControllers.app!.contracts.createProduct!.historicalDefinitions =
          [
            {
              commandName: 'createProduct',
              version: '0.9.0',
              payloadJsonSchema: JSONSchema.make(
                Schema.Struct({ name: Schema.String }),
              ),
            },
          ];
        const addedResult = yield* checkSystemCompatibility({
          prior: baseSpec,
          next: added,
        });
        expect(addedResult.requiredBump).toBe('minor');
        expect(addedResult.requiresNewGeneration).toBe(false);
        expect(addedResult.diffs).toContainEqual(
          expect.objectContaining({
            path: 'serviceControllers.app.contracts.createProduct.historicalDefinitions.0.9.0',
            kind: 'historical-definition-added',
          }),
        );

        const widened = structuredClone(added);
        widened.version = '1.2.0';
        widened.serviceControllers.app!.version = '1.2.0';
        widened.serviceControllers.app!.contracts.createProduct!.version =
          '1.2.0';
        widened.serviceControllers.app!.contracts.createProduct!.historicalDefinitions[0]!.payloadJsonSchema =
          JSONSchema.make(
            Schema.Struct({
              name: Schema.String,
              note: Schema.optional(Schema.String),
            }),
          );
        const widenedResult = yield* checkSystemCompatibility({
          prior: added,
          next: widened,
        });
        expect(widenedResult.requiredBump).toBe('minor');
        expect(widenedResult.requiresNewGeneration).toBe(false);
        expect(widenedResult.diffs).toContainEqual(
          expect.objectContaining({
            path: 'serviceControllers.app.contracts.createProduct.historicalDefinitions.0.9.0.payloadJsonSchema',
            kind: 'schema-widened',
          }),
        );

        const removed = structuredClone(added);
        removed.version = '2.0.0';
        removed.serviceControllers.app!.version = '2.0.0';
        removed.serviceControllers.app!.contracts.createProduct!.version =
          '2.0.0';
        removed.serviceControllers.app!.contracts.createProduct!.historicalDefinitions =
          [];
        const removedResult = yield* checkSystemCompatibility({
          prior: added,
          next: removed,
        });
        expect(removedResult.requiredBump).toBe('major');
        expect(removedResult.requiresNewGeneration).toBe(false);
        expect(removedResult.diffs).toContainEqual(
          expect.objectContaining({
            path: 'serviceControllers.app.contracts.createProduct.historicalDefinitions.0.9.0',
            kind: 'historical-definition-removed',
          }),
        );
      }),
  );

  it.effect(
    'classifies service actor authentication models separately from projected frontend models',
    () =>
      Effect.gen(function* () {
        const authenticationActor = structuredClone(baseSpec);
        authenticationActor.version = '1.1.0';
        authenticationActor.serviceControllers.app!.version = '1.1.0';
        authenticationActor.serviceControllers.app!.actorControllers.shopper =
          {
            name: 'shopper',
            version: '1.0.0',
            models: {
              product: structuredClone(
                authenticationActor.serviceControllers.app!.models.product!,
              ),
            },
            frontends: {},
          };
        const authenticationActorResult =
          yield* checkSystemCompatibility({
            prior: baseSpec,
            next: authenticationActor,
          });
        expect(authenticationActorResult.requiredBump).toBe('minor');
        expect(authenticationActorResult.requiresNewGeneration).toBe(false);

        const projectedFrontend = structuredClone(authenticationActor);
        projectedFrontend.version = '1.2.0';
        projectedFrontend.serviceControllers.app!.version = '1.2.0';
        projectedFrontend.serviceControllers.app!.actorControllers.shopper!.version =
          '1.1.0';
        projectedFrontend.serviceControllers.app!.actorControllers.shopper!.frontends.catalog =
          {
            name: 'catalog',
            frontendController: {
              serviceName: 'app',
              actorName: 'shopper',
              frontendName: 'catalog',
              version: '1.0.0',
              models: {
                product: structuredClone(
                  projectedFrontend.serviceControllers.app!.models.product!,
                ),
              },
              signatureJsonSchema: JSONSchema.make(
                Schema.Struct({ subject: Schema.String }),
              ),
            },
          };
        const projectedFrontendResult = yield* checkSystemCompatibility({
          prior: authenticationActor,
          next: projectedFrontend,
        });
        expect(projectedFrontendResult.requiredBump).toBe('minor');
        expect(projectedFrontendResult.requiresNewGeneration).toBe(true);

        const widenedSignature = structuredClone(projectedFrontend);
        widenedSignature.version = '1.3.0';
        widenedSignature.serviceControllers.app!.version = '1.3.0';
        widenedSignature.serviceControllers.app!.actorControllers.shopper!.version =
          '1.2.0';
        widenedSignature.serviceControllers.app!.actorControllers.shopper!.frontends.catalog!.frontendController.version =
          '1.1.0';
        widenedSignature.serviceControllers.app!.actorControllers.shopper!.frontends.catalog!.frontendController.signatureJsonSchema =
          JSONSchema.make(
            Schema.Struct({
              subject: Schema.String,
              tenant: Schema.optional(Schema.String),
            }),
          );
        const widenedSignatureResult = yield* checkSystemCompatibility({
          prior: projectedFrontend,
          next: widenedSignature,
        });
        expect(widenedSignatureResult.requiredBump).toBe('minor');
        expect(widenedSignatureResult.requiresNewGeneration).toBe(false);
        expect(widenedSignatureResult.diffs).toContainEqual(
          expect.objectContaining({
            path: 'serviceControllers.app.actorControllers.shopper.frontends.catalog.frontendController.signatureJsonSchema',
            kind: 'schema-widened',
          }),
        );

        const changedIdentity = structuredClone(projectedFrontend);
        changedIdentity.version = '2.0.0';
        changedIdentity.serviceControllers.app!.version = '2.0.0';
        changedIdentity.serviceControllers.app!.actorControllers.shopper!.version =
          '2.0.0';
        changedIdentity.serviceControllers.app!.actorControllers.shopper!.frontends.catalog!.frontendController.version =
          '2.0.0';
        changedIdentity.serviceControllers.app!.actorControllers.shopper!.frontends.catalog!.frontendController.serviceName =
          'other';
        const changedIdentityResult = yield* checkSystemCompatibility({
          prior: projectedFrontend,
          next: changedIdentity,
        });
        expect(changedIdentityResult.requiredBump).toBe('major');
        expect(changedIdentityResult.diffs).toContainEqual(
          expect.objectContaining({
            path: 'serviceControllers.app.actorControllers.shopper.frontends.catalog',
            kind: 'identity-changed',
          }),
        );

        const removedProjectionModel = structuredClone(projectedFrontend);
        removedProjectionModel.version = '2.0.0';
        removedProjectionModel.serviceControllers.app!.version = '2.0.0';
        removedProjectionModel.serviceControllers.app!.actorControllers.shopper!.version =
          '2.0.0';
        removedProjectionModel.serviceControllers.app!.actorControllers.shopper!.frontends.catalog!.frontendController.version =
          '2.0.0';
        delete removedProjectionModel.serviceControllers.app!.actorControllers
          .shopper!.frontends.catalog!.frontendController.models.product;
        const removedProjectionModelResult =
          yield* checkSystemCompatibility({
            prior: projectedFrontend,
            next: removedProjectionModel,
          });
        expect(removedProjectionModelResult.requiredBump).toBe('major');
        expect(removedProjectionModelResult.requiresNewGeneration).toBe(true);
      }),
  );

  it.effect('treats removed surfaces as major', () =>
    Effect.gen(function* () {
      const removed = structuredClone(baseSpec);
      removed.version = '2.0.0';
      delete removed.serviceControllers.app;
      const removedResult = yield* checkSystemCompatibility({
        prior: baseSpec,
        next: removed,
      });
      expect(removedResult.requiredBump).toBe('major');
      expect(removedResult.requiresNewGeneration).toBe(true);
      expect(removedResult.diffs).toContainEqual(
        expect.objectContaining({
          path: 'serviceControllers.app',
          kind: 'surface-removed',
        }),
      );
    }),
  );

  it.effect('reports production under-bumps while allowing over-bumps', () =>
    Effect.gen(function* () {
      const under = structuredClone(baseSpec);
      under.serviceControllers.app!.models.product!.properties = {
        ...under.serviceControllers.app!.models.product!.properties,
        note: primitives.text({ nullable: true }),
      };
      const underResult = yield* checkSystemCompatibility({
        prior: baseSpec,
        next: under,
      });
      expect(
        underResult.diffs.filter(diff => diff.kind === 'version-under-bumped'),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'serviceControllers.app.models.product.version',
          }),
          expect.objectContaining({ path: 'serviceControllers.app.version' }),
          expect.objectContaining({ path: 'version' }),
        ]),
      );

      const over = structuredClone(under);
      over.version = '2.0.0';
      over.serviceControllers.app!.version = '2.0.0';
      over.serviceControllers.app!.models.product!.version = '2.0.0';
      const overResult = yield* checkSystemCompatibility({
        prior: baseSpec,
        next: over,
      });
      expect(
        overResult.diffs.some(diff => diff.kind === 'version-under-bumped'),
      ).toBe(false);
    }),
  );

  it.effect(
    'classifies service, account, and actor controller additions as minor',
    () =>
      Effect.gen(function* () {
        const serviceAdded = structuredClone(baseSpec);
        serviceAdded.version = '1.1.0';
        serviceAdded.serviceControllers.audit = {
          name: 'audit',
          version: '1.0.0',
          models: {},
          contracts: {},
          mutationAdapters: {},
          queries: {},
        };
        const serviceResult = yield* checkSystemCompatibility({
          prior: baseSpec,
          next: serviceAdded,
        });
        expect(serviceResult.diffs).toContainEqual(
          expect.objectContaining({
            path: 'serviceControllers.audit',
            kind: 'surface-added',
            requiredBump: 'minor',
          }),
        );

        const fixtureSpec = makeSystemSpec({ system: fixtureSystem });
        const accountAdded = structuredClone(fixtureSpec);
        accountAdded.version = '1.1.0';
        accountAdded.accountControllers.organization = {
          name: 'organization',
          version: '1.0.0',
          models: {},
          contracts: {},
          mutationAdapters: {},
          actorControllers: {},
        };
        const accountResult = yield* checkSystemCompatibility({
          prior: fixtureSpec,
          next: accountAdded,
        });
        expect(accountResult.diffs).toContainEqual(
          expect.objectContaining({
            path: 'accountControllers.organization',
            kind: 'surface-added',
            requiredBump: 'minor',
          }),
        );

        const actorAdded = structuredClone(fixtureSpec);
        actorAdded.version = '1.1.0';
        actorAdded.accountControllers.user!.version = '1.1.0';
        actorAdded.accountControllers.user!.actorControllers.secondary = {
          name: 'secondary',
          version: '1.0.0',
          models: {},
          selections: {},
          queries: {},
          frontends: {},
        };
        const actorResult = yield* checkSystemCompatibility({
          prior: fixtureSpec,
          next: actorAdded,
        });
        expect(actorResult.diffs).toContainEqual(
          expect.objectContaining({
            path: 'accountControllers.user.actorControllers.secondary',
            kind: 'surface-added',
            requiredBump: 'minor',
          }),
        );

        expect(serviceResult.requiredBump).toBe('minor');
        expect(accountResult.requiredBump).toBe('minor');
        expect(actorResult.requiredBump).toBe('minor');
      }),
  );

  it.effect('classifies selection and frontend membership changes', () =>
    Effect.gen(function* () {
      const fixtureSpec = makeSystemSpec({ system: fixtureSystem });

      const selectionAdded = structuredClone(fixtureSpec);
      selectionAdded.version = '1.1.0';
      selectionAdded.accountControllers.user!.version = '1.1.0';
      selectionAdded.accountControllers.user!.actorControllers.main!.version =
        '1.1.0';
      selectionAdded.accountControllers.user!.actorControllers.main!.selections.alias =
        { modelName: 'user' };
      const selectionAddedResult = yield* checkSystemCompatibility({
        prior: fixtureSpec,
        next: selectionAdded,
      });
      expect(selectionAddedResult.diffs).toContainEqual(
        expect.objectContaining({
          path: 'accountControllers.user.actorControllers.main.selections.alias',
          kind: 'surface-added',
          requiredBump: 'minor',
        }),
      );

      const selectionRemoved = structuredClone(fixtureSpec);
      selectionRemoved.version = '2.0.0';
      selectionRemoved.accountControllers.user!.version = '2.0.0';
      selectionRemoved.accountControllers.user!.actorControllers.main!.version =
        '2.0.0';
      delete selectionRemoved.accountControllers.user!.actorControllers.main!
        .selections.item;
      const selectionRemovedResult = yield* checkSystemCompatibility({
        prior: fixtureSpec,
        next: selectionRemoved,
      });
      expect(selectionRemovedResult.diffs).toContainEqual(
        expect.objectContaining({
          path: 'accountControllers.user.actorControllers.main.selections.item',
          kind: 'surface-removed',
          requiredBump: 'major',
        }),
      );

      const frontendAdded = structuredClone(fixtureSpec);
      frontendAdded.version = '1.1.0';
      frontendAdded.accountControllers.user!.version = '1.1.0';
      frontendAdded.accountControllers.user!.actorControllers.main!.version =
        '1.1.0';
      const mobileBinding = structuredClone(
        frontendAdded.accountControllers.user!.actorControllers.main!.frontends
          .main!,
      );
      mobileBinding.name = 'mobile';
      mobileBinding.frontendController.frontendName = 'mobile';
      frontendAdded.accountControllers.user!.actorControllers.main!.frontends.mobile =
        mobileBinding;
      const frontendAddedResult = yield* checkSystemCompatibility({
        prior: fixtureSpec,
        next: frontendAdded,
      });
      expect(frontendAddedResult.diffs).toContainEqual(
        expect.objectContaining({
          path: 'accountControllers.user.actorControllers.main.frontends.mobile',
          kind: 'surface-added',
          requiredBump: 'minor',
        }),
      );

      const frontendRemoved = structuredClone(fixtureSpec);
      frontendRemoved.version = '2.0.0';
      frontendRemoved.accountControllers.user!.version = '2.0.0';
      frontendRemoved.accountControllers.user!.actorControllers.main!.version =
        '2.0.0';
      delete frontendRemoved.accountControllers.user!.actorControllers.main!
        .frontends.main;
      const frontendRemovedResult = yield* checkSystemCompatibility({
        prior: fixtureSpec,
        next: frontendRemoved,
      });
      expect(frontendRemovedResult.diffs).toContainEqual(
        expect.objectContaining({
          path: 'accountControllers.user.actorControllers.main.frontends.main',
          kind: 'surface-removed',
          requiredBump: 'major',
        }),
      );
    }),
  );

  it.effect('compares frontend signature schemas directionally', () =>
    Effect.gen(function* () {
      const fixtureSpec = makeSystemSpec({ system: fixtureSystem });

      const widened = structuredClone(fixtureSpec);
      widened.version = '1.1.0';
      widened.accountControllers.user!.version = '1.1.0';
      widened.accountControllers.user!.actorControllers.main!.version = '1.1.0';
      widened.accountControllers.user!.actorControllers.main!.frontends.main!.frontendController.version =
        '1.1.0';
      widened.accountControllers.user!.actorControllers.main!.frontends.main!.frontendController.signatureJsonSchema =
        JSONSchema.make(
          Schema.Struct({
            userId: makeModelIdSchema(User),
            deviceId: Schema.optional(Schema.String),
          }),
        );
      const widenedResult = yield* checkSystemCompatibility({
        prior: fixtureSpec,
        next: widened,
      });
      expect(widenedResult.diffs).toContainEqual(
        expect.objectContaining({
          path: 'accountControllers.user.actorControllers.main.frontends.main.frontendController.signatureJsonSchema',
          kind: 'schema-widened',
          requiredBump: 'minor',
        }),
      );

      const narrowed = structuredClone(fixtureSpec);
      narrowed.version = '2.0.0';
      narrowed.accountControllers.user!.version = '2.0.0';
      narrowed.accountControllers.user!.actorControllers.main!.version =
        '2.0.0';
      narrowed.accountControllers.user!.actorControllers.main!.frontends.main!.frontendController.version =
        '2.0.0';
      narrowed.accountControllers.user!.actorControllers.main!.frontends.main!.frontendController.signatureJsonSchema =
        JSONSchema.make(
          Schema.Struct({
            userId: makeModelIdSchema(User),
            requiredDeviceId: Schema.String,
          }),
        );
      const narrowedResult = yield* checkSystemCompatibility({
        prior: fixtureSpec,
        next: narrowed,
      });
      expect(narrowedResult.diffs).toContainEqual(
        expect.objectContaining({
          path: 'accountControllers.user.actorControllers.main.frontends.main.frontendController.signatureJsonSchema',
          kind: 'schema-incompatible',
          requiredBump: 'major',
        }),
      );
    }),
  );

  it.effect('propagates frontend signature severity through every owner', () =>
    Effect.gen(function* () {
      const fixtureSpec = makeSystemSpec({ system: fixtureSystem });
      const next = structuredClone(fixtureSpec);
      next.accountControllers.user!.actorControllers.main!.frontends.main!.frontendController.signatureJsonSchema =
        JSONSchema.make(
          Schema.Struct({
            userId: makeModelIdSchema(User),
            requiredDeviceId: Schema.String,
          }),
        );

      const result = yield* checkSystemCompatibility({
        prior: fixtureSpec,
        next,
      });

      expect(
        result.diffs
          .filter(diff => diff.kind === 'version-under-bumped')
          .map(diff => diff.path),
      ).toEqual(
        expect.arrayContaining([
          'accountControllers.user.actorControllers.main.frontends.main.frontendController.version',
          'accountControllers.user.actorControllers.main.version',
          'accountControllers.user.version',
          'version',
        ]),
      );
    }),
  );

  it.effect('classifies mutation adapter additions and removals', () =>
    Effect.gen(function* () {
      const added = structuredClone(baseSpec);
      added.version = '1.1.0';
      added.serviceControllers.app!.version = '1.1.0';
      added.serviceControllers.app!.mutationAdapters.product = {
        create: [
          {
            source: {
              modelName: 'product',
              modelVersion: '0.9.0',
              operationName: 'create',
              jsonSchema: { type: 'object' },
            },
            destination: {
              modelName: 'product',
              modelVersion: '1.0.0',
              operationName: 'create',
              jsonSchema: { type: 'object' },
            },
          },
        ],
      };
      const addedResult = yield* checkSystemCompatibility({
        prior: baseSpec,
        next: added,
      });
      expect(addedResult.diffs).toContainEqual(
        expect.objectContaining({
          path: 'serviceControllers.app.mutationAdapters',
          kind: 'adapter-added',
          requiredBump: 'minor',
        }),
      );

      const removed = structuredClone(added);
      removed.version = '2.0.0';
      removed.serviceControllers.app!.version = '2.0.0';
      removed.serviceControllers.app!.mutationAdapters = {};
      const removedResult = yield* checkSystemCompatibility({
        prior: added,
        next: removed,
      });
      expect(removedResult.diffs).toContainEqual(
        expect.objectContaining({
          path: 'serviceControllers.app.mutationAdapters',
          kind: 'adapter-removed',
          requiredBump: 'major',
        }),
      );
    }),
  );

  it.effect('reports invalid system, controller, and contract SemVers', () =>
    Effect.gen(function* () {
      const next = structuredClone(baseSpec);
      next.version = '1';
      next.serviceControllers.app!.version = '01.0.0';
      next.serviceControllers.app!.contracts.createProduct!.version = '1.0';

      const result = yield* checkSystemCompatibility({
        prior: baseSpec,
        next,
      });

      expect(
        result.diffs
          .filter(diff => diff.kind === 'invalid-semver')
          .map(diff => diff.path),
      ).toEqual(
        expect.arrayContaining([
          'serviceControllers.app.contracts.createProduct.version',
          'serviceControllers.app.version',
          'version',
        ]),
      );
    }),
  );
});
