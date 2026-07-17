import { describe, expect, it } from '@effect/vitest';
import { Effect, Schema } from 'effect';

import { createList, List, system } from '../fixtures/system.ts';
import { makeServiceModel } from '../models/makeServiceModel.ts';
import { primitives } from '../models/primitives.ts';
import { makeServiceController } from '../service/makeServiceController.ts';

import { makeContract } from './makeContract.ts';
import { makeMutations } from './makeMutations.ts';

const ServiceProduct = makeServiceModel(
  {
    serviceName: 'app',
    abbreviation: 'sprd',
    modelName: 'serviceProduct',
    attributes: { name: primitives.text() },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

const createServiceProduct = makeContract({
  commandName: 'createServiceProduct',
  payload: {
    id: ServiceProduct.primaryKey({ autogenerate: false }),
    name: primitives.text(),
  },
  mutations: Schema.Struct({
    created: ServiceProduct.createMutation('1.0.0'),
  }),
  program: ({ payload }) =>
    Effect.all({
      created: ServiceProduct.create('1.0.0', {
        resourceId: payload.id,
        attributes: { name: payload.name },
      }),
    }),
  version: '1.0.0',
});

const replicateServiceProduct = makeContract({
  commandName: 'replicateServiceProduct',
  payload: {
    product: primitives.json({ schema: ServiceProduct.resourceSchema }),
  },
  mutations: Schema.Struct({
    replicated: ServiceProduct.replicateResourceMutation('1.0.0'),
  }),
  program: ({ payload }) =>
    Effect.all({
      replicated: ServiceProduct.replicateResource('1.0.0', {
        resource: payload.product,
      }),
    }),
  version: '1.0.0',
});

describe('makeMutations', () => {
  it.effect('runs account controller contracts', () =>
    Effect.gen(function* () {
      const accountController = system.accountControllers.user!;
      const command = {
        id: 'cmd_test' as const,
        commandName: 'createList',
        version: '1.0.0',
        payload: {
          id: 'lst_test',
          name: 'Test List',
          userId: 'usr_test',
        },
        commandType: 'account' as const,
        systemVersion: '1.0.0',
        accountId: 'acct_1',
        accountName: 'user',
      };

      const result = yield* makeMutations({
        contract: accountController.contracts.createList,
        models: accountController.models,
        owner: { kind: 'account' },
        command,
      });

      expect(result.payload).toEqual(command.payload);
      expect(result.mutations.length).toBeGreaterThan(0);
      expect(result.mutations[0]?.operationName).toBe('create');
    }),
  );

  it.effect('runs frontend binding contracts', () =>
    Effect.gen(function* () {
      const frontendBinding =
        system.accountControllers.user!.actorControllers.main!.frontends.main!;
      const command = {
        id: 'cmd_test' as const,
        commandName: 'createList',
        version: '1.0.0',
        payload: {
          id: 'lst_frontend',
          name: 'Actor List',
          userId: 'usr_test',
        },
        commandType: 'actor' as const,
        systemVersion: '1.0.0',
        accountId: 'acct_1',
        accountName: 'user',
        actorId: 'actr_1',
        actorName: 'main',
        frontendName: 'main',
      };

      const result = yield* makeMutations({
        contract: frontendBinding.contracts.createList,
        models: frontendBinding.models,
        owner: { kind: 'account' },
        command,
      });

      expect(result.payload).toEqual(command.payload);
      expect(result.mutations.length).toBeGreaterThan(0);
    }),
  );

  it.effect('runs service controller contracts', () =>
    Effect.gen(function* () {
      const service = makeServiceController({
        name: 'app',
        version: '1.0.0',
        models: {
          serviceProduct: ServiceProduct,
        },
        contracts: {
          createServiceProduct,
        },
      });
      const command = {
        id: 'cmd_test' as const,
        commandName: 'createServiceProduct',
        version: '1.0.0',
        payload: {
          id: 'sprd_service',
          name: 'Service Product',
        },
        commandType: 'service' as const,
        systemVersion: '1.0.0',
        serviceName: 'app',
      };

      const result = yield* makeMutations({
        contract: service.contracts.createServiceProduct,
        models: service.models,
        owner: { kind: 'service', serviceName: 'app' },
        command,
      });

      expect(result.payload).toEqual(command.payload);
      expect(result.mutations.length).toBeGreaterThan(0);
      expect(result.mutations[0]?.operationName).toBe('create');
    }),
  );

  it.effect('normalizes a single mutation object', () =>
    Effect.gen(function* () {
      const createSingleList = makeContract({
        commandName: 'createSingleList',
        payload: createList.payload,
        mutations: List.createMutation('1.0.0'),
        program: ({ payload }) =>
          List.create('1.0.0', {
            resourceId: payload.id,
            attributes: {
              name: payload.name,
              userId: payload.userId,
            },
          }),
        version: '1.0.0',
      });
      const command = {
        id: 'cmd_test' as const,
        commandName: 'createSingleList',
        version: '1.0.0',
        payload: {
          id: 'lst_single',
          name: 'Single List',
          userId: 'usr_test',
        },
      };

      const result = yield* makeMutations({
        contract: createSingleList,
        models: {
          list: List,
        },
        owner: { kind: 'account' },
        command,
      });

      expect(result.mutations).toHaveLength(1);
      expect(result.mutations[0]?.operationName).toBe('create');
    }),
  );

  it.effect('preserves Schema.Tuple mutation declaration order', () =>
    Effect.gen(function* () {
      const tupleContract = makeContract({
        commandName: 'replaceListsInTupleOrder',
        payload: {
          firstId: List.primaryKey({ autogenerate: false }),
          secondId: List.primaryKey({ autogenerate: false }),
          userId: List.propertiesShape.userId,
        },
        mutations: Schema.Tuple(
          List.deleteMutation('1.0.0'),
          List.createMutation('1.0.0'),
        ),
        program: ({ payload }) =>
          Effect.all([
            List.delete('1.0.0', { resourceId: payload.firstId }),
            List.create('1.0.0', {
              resourceId: payload.secondId,
              attributes: {
                name: 'Second',
                userId: payload.userId,
              },
            }),
          ]),
        version: '1.0.0',
      });

      const result = yield* makeMutations({
        contract: tupleContract,
        models: { list: List },
        owner: { kind: 'account' },
        command: {
          id: 'cmd_tuple_order',
          commandName: 'replaceListsInTupleOrder',
          version: '1.0.0',
          payload: {
            firstId: 'lst_first',
            secondId: 'lst_second',
            userId: 'usr_test',
          },
        },
      });

      expect(
        result.mutations.map(mutation => ({
          operationName: mutation.operationName,
          resourceId: mutation.resourceId,
        })),
      ).toEqual([
        { operationName: 'delete', resourceId: 'lst_first' },
        { operationName: 'create', resourceId: 'lst_second' },
      ]);
    }),
  );

  it.effect('preserves Schema.Array mutation declaration order', () =>
    Effect.gen(function* () {
      const arrayContract = makeContract({
        commandName: 'deleteListsInArrayOrder',
        payload: {
          firstId: List.primaryKey({ autogenerate: false }),
          secondId: List.primaryKey({ autogenerate: false }),
        },
        mutations: Schema.Array(List.deleteMutation('1.0.0')),
        program: ({ payload }) =>
          Effect.all([
            List.delete('1.0.0', { resourceId: payload.firstId }),
            List.delete('1.0.0', { resourceId: payload.secondId }),
          ]),
        version: '1.0.0',
      });

      const result = yield* makeMutations({
        contract: arrayContract,
        models: { list: List },
        owner: { kind: 'account' },
        command: {
          id: 'cmd_array_order',
          commandName: 'deleteListsInArrayOrder',
          version: '1.0.0',
          payload: {
            firstId: 'lst_first',
            secondId: 'lst_second',
          },
        },
      });

      expect(result.mutations.map(mutation => mutation.resourceId)).toEqual([
        'lst_first',
        'lst_second',
      ]);
    }),
  );

  it.effect('rejects program output that does not match the mutations schema', () =>
    Effect.gen(function* () {
      const invalidOutputContract = makeContract({
        commandName: 'invalidCreateOutput',
        payload: {
          id: List.primaryKey({ autogenerate: false }),
        },
        mutations: Schema.Struct({
          created: List.createMutation('1.0.0'),
        }),
        // @ts-expect-error runtime validation still protects untyped programs
        program: ({ payload }) =>
          Effect.all({
            created: List.delete('1.0.0', { resourceId: payload.id }),
          }),
        version: '1.0.0',
      });

      const result = yield* makeMutations({
        contract: invalidOutputContract,
        models: { list: List },
        owner: { kind: 'account' },
        command: {
          id: 'cmd_invalid_output',
          commandName: 'invalidCreateOutput',
          version: '1.0.0',
          payload: { id: 'lst_invalid_output' },
        },
      }).pipe(Effect.either);

      expect(result._tag).toBe('Left');
      if (result._tag === 'Left') {
        expect(result.left.code).toBe('validate-contract-mutations-failed');
        expect(result.left.message).toContain(
          'Contract "invalidCreateOutput" program output did not match its mutations schema',
        );
      }
    }),
  );

  it.effect('flattens a mutations-null contract to no mutations', () =>
    Effect.gen(function* () {
      const nullContract = makeContract({
        commandName: 'readList',
        payload: {
          id: List.primaryKey({ autogenerate: false }),
        },
        mutations: null,
        version: '1.0.0',
      });

      const result = yield* makeMutations({
        contract: nullContract,
        models: { list: List },
        owner: { kind: 'account' },
        command: {
          id: 'cmd_read_list',
          commandName: 'readList',
          version: '1.0.0',
          payload: { id: 'lst_read' },
        },
      });

      expect(result.mutations).toEqual([]);
    }),
  );

  it.effect('rejects service contract mutations outside service models', () =>
    Effect.gen(function* () {
      const service = makeServiceController({
        name: 'app',
        version: '1.0.0',
        models: {
          serviceProduct: ServiceProduct,
        },
        // @ts-expect-error runtime validation still protects untyped boundaries
        contracts: {
          createList,
        },
      });
      const command = {
        id: 'cmd_test' as const,
        commandName: 'createList',
        version: '1.0.0',
        payload: {
          id: 'lst_service',
          name: 'Service List',
          userId: 'usr_test',
        },
        commandType: 'service' as const,
        systemVersion: '1.0.0',
        serviceName: 'app',
      };

      const maybeMutations = yield* makeMutations({
        contract: service.contracts.createList,
        models: service.models,
        owner: { kind: 'service', serviceName: 'app' },
        command,
      }).pipe(Effect.either);

      expect(maybeMutations._tag).toBe('Left');
      if (maybeMutations._tag === 'Left') {
        expect(maybeMutations.left.code).toBe(
          'contract-mutation-model-out-of-scope',
        );
      }
    }),
  );

  it.effect(
    'rejects ordinary service-model mutations from account owners',
    () =>
      Effect.gen(function* () {
        const command = {
          id: 'cmd_account_service_model' as const,
          commandName: 'createServiceProduct',
          version: '1.0.0',
          payload: {
            id: 'sprd_account_service_model',
            name: 'Account-owned service product',
          },
          commandType: 'account' as const,
          systemVersion: '1.0.0',
          accountId: 'acct_1',
          accountName: 'user',
        };

        const maybeMutations = yield* makeMutations({
          contract: createServiceProduct,
          models: { serviceProduct: ServiceProduct },
          owner: { kind: 'account' },
          command,
        }).pipe(Effect.either);

        expect(maybeMutations._tag).toBe('Left');
        if (maybeMutations._tag === 'Left') {
          expect(maybeMutations.left.code).toBe(
            'contract-mutation-model-owner-mismatch',
          );
        }
      }),
  );

  it.effect('rejects replicateResource from service owners', () =>
    Effect.gen(function* () {
      const now = new Date(0);
      const service = makeServiceController({
        name: 'app',
        version: '1.0.0',
        models: { serviceProduct: ServiceProduct },
        // @ts-expect-error service contracts cannot emit replicateResource
        contracts: { replicateServiceProduct },
      });
      const command = {
        id: 'cmd_service_replication' as const,
        commandName: 'replicateServiceProduct',
        version: '1.0.0',
        payload: {
          product: {
            id: 'sprd_service_replication',
            modelName: 'serviceProduct',
            name: 'Service replication',
            version: '1.0.0',
            createdAt: now,
            updatedAt: now,
          },
        },
        commandType: 'service' as const,
        systemVersion: '1.0.0',
        serviceName: 'app',
      };

      const maybeMutations = yield* makeMutations({
        contract: service.contracts.replicateServiceProduct,
        models: service.models,
        owner: { kind: 'service', serviceName: 'app' },
        command,
      }).pipe(Effect.either);

      expect(maybeMutations._tag).toBe('Left');
      if (maybeMutations._tag === 'Left') {
        expect(maybeMutations.left.code).toBe(
          'contract-mutation-model-owner-mismatch',
        );
      }
    }),
  );
});
