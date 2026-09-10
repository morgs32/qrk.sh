import { describe, expect, it } from '@effect/vitest';
import { primitives } from '@zerospin/schema';
import { Effect } from 'effect';

import {
  createList,
  List,
  ListModel,
  main,
  system,
  UserModel,
} from '../fixtures/system.ts';
import { models } from '../models/index.ts';
import { makeReplica } from '../models/makeReplica.ts';
import { makePrefixedIncrementalIdFactory } from '../test-utils/makePrefixedIncrementalIdFactory.ts';

import { makeMutations } from './makeMutations.ts';

import { contracts } from './index.ts';

const ServiceProductModel = models.makeModel({
  name: 'serviceProduct',
  abbreviation: 'sprd',
});

const ServiceProduct = models.makeVersion(ServiceProductModel, {
  attributes: { name: primitives.text() },
  indexes: [],
  version: '1.0.0',
});
const ServiceProductReplica = makeReplica({
  sourceModel: ServiceProduct,
  modelVersion: ServiceProduct.version,
  serviceName: 'app',
});

const createServiceProduct = contracts.makeVersion(
  contracts.makeCommand('createServiceProduct'),
  {
    payload: {
      id: primitives.foreignKey({
        abbreviation: ServiceProductModel.abbreviation,
      }),
      name: primitives.text(),
    },
    models: { serviceProduct: ServiceProduct },
    program: ({ payload, models }) =>
      Effect.all({
        created: models.serviceProduct.create({
          resourceId: payload.id,
          attributes: { name: payload.name },
        }),
      }),
    version: '1.0.0',
  },
);

const replicateServiceProduct = contracts.makeVersion(
  contracts.makeCommand('replicateServiceProduct'),
  {
    payload: {
      product: primitives.json({ schema: ServiceProduct.resourceSchema }),
    },
    models: { serviceProduct: ServiceProductReplica },
    program: ({ payload, models }) =>
      Effect.all({
        replicated: models.serviceProduct.replicate(payload.product),
      }),
    version: '1.0.0',
  },
);

describe('makeMutations', () => {
  it.layer(makePrefixedIncrementalIdFactory('makeMutations'))(it => {
    it.effect('runs aggregate contracts', () =>
      Effect.gen(function* () {
        const aggregate = system.aggregates.user['1.0.0'];
        const command = {
          id: 'cmd_test' as const,
          commandName: 'createList',
          contractVersion: '1.0.0',
          payload: {
            id: 'lst_test',
            name: 'Test List',
            userId: 'usr_test',
          },
          aggregateId: 'acct_1',
          aggregateName: 'user',
        };

        const result = yield* makeMutations({
          contract: aggregate.contracts.createList.contract,
          models: aggregate.models,
          command,
        });

        expect(result.payload).toEqual(command.payload);
        expect(result.mutations.length).toBeGreaterThan(0);
        expect(result.mutations[0]?.operationName).toBe('create');
      }),
    );

    it.effect('runs frontend binding contracts', () =>
      Effect.gen(function* () {
        const command = {
          id: 'cmd_test' as const,
          commandName: 'createList',
          contractVersion: '1.0.0',
          payload: {
            id: 'lst_frontend',
            name: 'Frontend List',
            userId: 'usr_test',
          },
          aggregateId: 'acct_1',
          aggregateName: 'user',
          userId: 'user_1',
          frontendName: 'main',
        };

        const result = yield* makeMutations({
          contract: main.contracts.createList.contract,
          models: main.models,
          command,
        });

        expect(result.payload).toEqual(command.payload);
        expect(result.mutations.length).toBeGreaterThan(0);
      }),
    );

    it.effect('runs service contracts', () =>
      Effect.gen(function* () {
        const command = {
          id: 'cmd_test' as const,
          commandName: 'createServiceProduct',
          contractVersion: '1.0.0',
          payload: {
            id: 'sprd_service',
            name: 'Service Product',
          },
          serviceVersion: '1.0.0',
          serviceName: 'app',
        };

        const result = yield* makeMutations({
          contract: createServiceProduct,
          models: { serviceProduct: ServiceProduct },
          command,
        });

        expect(result.payload).toEqual(command.payload);
        expect(result.mutations.length).toBeGreaterThan(0);
        expect(result.mutations[0]?.operationName).toBe('create');
      }),
    );

    it.effect('normalizes a single mutation object', () =>
      Effect.gen(function* () {
        const createSingleList = contracts.makeVersion(
          contracts.makeCommand('createSingleList'),
          {
            payload: createList.payload,
            models: { list: List },
            program: ({ payload, models }) =>
              models.list.create({
                resourceId: payload.id,
                attributes: {
                  name: payload.name,
                  userId: payload.userId,
                },
              }),
            version: '1.0.0',
          },
        );
        const command = {
          id: 'cmd_test' as const,
          commandName: 'createSingleList',
          contractVersion: '1.0.0',
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
          command,
        });

        expect(result.mutations).toHaveLength(1);
        expect(result.mutations[0]?.operationName).toBe('create');
      }),
    );

    it.effect('preserves Schema.Tuple mutation declaration order', () =>
      Effect.gen(function* () {
        const tupleContract = contracts.makeVersion(
          contracts.makeCommand('replaceListsInTupleOrder'),
          {
            payload: {
              firstId: primitives.foreignKey({
                abbreviation: ListModel.abbreviation,
              }),
              secondId: primitives.foreignKey({
                abbreviation: ListModel.abbreviation,
              }),
              userId: primitives.foreignKey({
                abbreviation: UserModel.abbreviation,
              }),
            },
            models: { list: List },
            program: ({ payload, models }) =>
              Effect.all([
                models.list.delete({ resourceId: payload.firstId }),
                models.list.create({
                  resourceId: payload.secondId,
                  attributes: {
                    name: 'Second',
                    userId: payload.userId,
                  },
                }),
              ]),
            version: '1.0.0',
          },
        );

        const result = yield* makeMutations({
          contract: tupleContract,
          models: { list: List },
          command: {
            id: 'cmd_tuple_order',
            commandName: 'replaceListsInTupleOrder',
            contractVersion: '1.0.0',
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
        const arrayContract = contracts.makeVersion(
          contracts.makeCommand('deleteListsInArrayOrder'),
          {
            payload: {
              firstId: primitives.foreignKey({
                abbreviation: ListModel.abbreviation,
              }),
              secondId: primitives.foreignKey({
                abbreviation: ListModel.abbreviation,
              }),
            },
            models: { list: List },
            program: ({ payload, models }) =>
              Effect.all([
                models.list.delete({ resourceId: payload.firstId }),
                models.list.delete({ resourceId: payload.secondId }),
              ]),
            version: '1.0.0',
          },
        );

        const result = yield* makeMutations({
          contract: arrayContract,
          models: { list: List },
          command: {
            id: 'cmd_array_order',
            commandName: 'deleteListsInArrayOrder',
            contractVersion: '1.0.0',
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

    it.effect(
      'rejects a program result that is not a mutation, array, or record',
      () =>
        Effect.gen(function* () {
          const invalidOutputContract = contracts.makeVersion(
            contracts.makeCommand('invalidCreateOutput'),
            {
              payload: {
                id: primitives.foreignKey({
                  abbreviation: ListModel.abbreviation,
                }),
              },
              models: { list: List },
              // @ts-expect-error runtime validation still protects untyped programs
              program: () => Effect.succeed(null),
              version: '1.0.0',
            },
          );

          const result = yield* makeMutations({
            contract: invalidOutputContract,
            models: { list: List },
            command: {
              id: 'cmd_invalid_output',
              commandName: 'invalidCreateOutput',
              contractVersion: '1.0.0',
              payload: { id: 'lst_invalid_output' },
            },
          }).pipe(Effect.result);

          expect(result._tag).toBe('Failure');
          if (result._tag === 'Failure') {
            expect(result.failure.code).toBe('contract-program-result-invalid');
            expect(result.failure.message).toContain(
              'Contract "invalidCreateOutput" must return a mutation, array, or record',
            );
          }
        }),
    );

    it.effect('flattens a mutations-null contract to no mutations', () =>
      Effect.gen(function* () {
        const nullContract = contracts.makeVersion(
          contracts.makeCommand('readList'),
          {
            payload: {
              id: primitives.foreignKey({
                abbreviation: ListModel.abbreviation,
              }),
            },
            version: '1.0.0',
          },
        );

        const result = yield* makeMutations({
          contract: nullContract,
          models: { list: List },
          command: {
            id: 'cmd_read_list',
            commandName: 'readList',
            contractVersion: '1.0.0',
            payload: { id: 'lst_read' },
          },
        });

        expect(result.mutations).toEqual([]);
      }),
    );

    it.effect('rejects service contract mutations outside service models', () =>
      Effect.gen(function* () {
        const command = {
          id: 'cmd_test' as const,
          commandName: 'createList',
          contractVersion: '1.0.0',
          payload: {
            id: 'lst_service',
            name: 'Service List',
            userId: 'usr_test',
          },
          serviceVersion: '1.0.0',
          serviceName: 'app',
        };

        const maybeMutations = yield* makeMutations({
          contract: createList,
          models: { serviceProduct: ServiceProduct },
          command,
        }).pipe(Effect.result);

        expect(maybeMutations._tag).toBe('Failure');
        if (maybeMutations._tag === 'Failure') {
          expect(maybeMutations.failure.code).toBe(
            'contract-mutation-model-out-of-scope',
          );
        }
      }),
    );

    it.effect('rejects ordinary mutations on replica models', () =>
      Effect.gen(function* () {
        const createServiceProductReplica = contracts.makeVersion(
          contracts.makeCommand('createServiceProduct'),
          {
            payload: createServiceProduct.payload,
            models: { serviceProductReplica: ServiceProductReplica },
            program: ({ payload, models }) =>
              Effect.all({
                created: models.serviceProductReplica.create({
                  resourceId: payload.id,
                  attributes: { name: payload.name },
                }),
              }),
            version: '1.0.0',
          },
        );
        const command = {
          id: 'cmd_aggregate_service_model' as const,
          commandName: 'createServiceProduct',
          contractVersion: '1.0.0',
          payload: {
            id: 'sprd_aggregate_service_model',
            name: 'Aggregate-owned service product',
          },
          aggregateId: 'acct_1',
          aggregateName: 'user',
        };

        const maybeMutations = yield* makeMutations({
          contract: createServiceProductReplica,
          models: { serviceProduct: ServiceProductReplica },
          command,
        }).pipe(Effect.result);

        expect(maybeMutations._tag).toBe('Failure');
        if (maybeMutations._tag === 'Failure') {
          expect(maybeMutations.failure.code).toBe(
            'contract-mutation-model-operation-mismatch',
          );
        }
      }),
    );
  });
});
