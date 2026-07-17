import { Effect } from 'effect';

/**
 * Let `makeRepoUtils` context type repo wiring callbacks, and put DO lookup in
 * the repo's explicit `get*Repo` helper.
 *
 * @bad Do not put generic Durable Object lookup in `makeRepoUtils`; `getBinding` and `getRepo` belong outside repoUtils.
 * @bad Do not restate route-derived `{ name, key, storage }` props on `getDbConfig`; let `makeRepoUtils` provide the callback type.
 * @bad Do not call `OrderRepo.repoUtils.getRepo(...)`; call `yield* getOrderRepo(...)`.
 */
export const orderRepoUtils = makeRepoUtils({
  abbreviation: 'ordrepo',
  namePattern: parseRoutePattern('/:accountId/:orderName'),
  managedRuntime,
  getDbConfig: Effect.fn('OrderRepo.getDbConfig')(function* (props) {
    const orderController = yield* getOrderController({
      orderName: props.key.orderName,
    });

    return makeResourceDbConfig({
      models: orderController.models,
    });
  }),
});

export const getOrderRepo = Effect.fn('getOrderRepo')(function* (props: {
  key: {
    accountId: string;
    orderName: string;
  };
}) {
  const name = yield* OrderRepo.repoUtils.nameUtils.makeName(props.key);

  return env.ORDER_REPO.getByName(name) as DurableObjectStub<
    Rpc.DurableObjectBranded & OrderRepo
  >;
});

export const useOrderRepo = Effect.fn('useOrderRepo')(function* () {
  const orderRepo = yield* getOrderRepo({
    key: {
      accountId: 'acct_1',
      orderName: 'fulfillment',
    },
  });

  yield* callOrderRepo(orderRepo);
});

/**
 * @bad
 */
export const orderRepoUtilsWithLookup = makeRepoUtils({
  abbreviation: 'ordrepo',
  namePattern: parseRoutePattern('/:accountId/:orderName'),
  managedRuntime,
  getBinding: (): DurableObjectNamespace<
    Rpc.DurableObjectBranded &
      IRpcTarget<{
        authorize(props: { accountId: string }): IRpcEitherEncoded<void>;
      }>
  > => env.ORDER_REPO,
  getDbConfig: Effect.fn('OrderRepo.getDbConfig')(function* (props: {
    name: string;
    key: {
      accountId: string;
      orderName: string;
    };
    storage: DurableObjectStorage;
  }) {
    const orderController = yield* getOrderController({
      orderName: props.key.orderName,
    });

    return makeResourceDbConfig({
      models: orderController.models,
    });
  }),
});

/**
 * @bad
 */
const orderRepoFromRepoUtils = OrderRepo.repoUtils.getRepo({
  key: {
    accountId: 'acct_1',
    orderName: 'fulfillment',
  },
});
export const useRepoUtilsLookup = Effect.fn('useRepoUtilsLookup')(function* () {
  yield* callOrderRepo(orderRepoFromRepoUtils);
});

declare function makeRepoUtils(props: {
  abbreviation: string;
  namePattern: unknown;
  managedRuntime: unknown;
  getDbConfig: (props: {
    name: string;
    key: { accountId: string; orderName: string };
    storage: DurableObjectStorage;
  }) => Effect.Effect<unknown>;
}): {
  nameUtils: {
    makeName(props: {
      accountId: string;
      orderName: string;
    }): Effect.Effect<string>;
  };
};
declare function parseRoutePattern(pattern: string): unknown;
declare const managedRuntime: unknown;
declare const env: { ORDER_REPO: { getByName(name: string): unknown } };
declare class OrderRepo {
  static readonly repoUtils: {
    nameUtils: {
      makeName(props: {
        accountId: string;
        orderName: string;
      }): Effect.Effect<string>;
    };
    getRepo(props: { key: { accountId: string; orderName: string } }): unknown;
  };
}
declare function getOrderController(props: {
  orderName: string;
}): Effect.Effect<{ models: unknown }, unknown>;
declare function makeResourceDbConfig(props: { models: unknown }): unknown;
declare function callOrderRepo(repo: unknown): Effect.Effect<void>;
declare namespace Rpc {
  interface DurableObjectBranded {
    readonly _rpcBrand: unique symbol;
  }
}
interface IRpcTarget<T> {
  readonly _target: T;
}
type IRpcEitherEncoded<T> = T;
