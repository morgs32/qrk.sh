/**
 * Define service-owned data with makeModel, derive aggregate-held copies with
 * makeReplica, and register each model only with its owner. Use authoritative
 * models in direct service frontends and replicas in aggregate frontends and
 * selections. Use
 * Product.resourceSchema for authoritative payloads and
 * ProductReplica.replicateResource for aggregate replication.
 *
 * @bad Add serviceName or deletedAt to makeModel; service ownership and replica
 * tombstones are not intrinsic authoritative-model fields.
 * @bad Register ProductReplica in services.app.models.
 * @bad Register the authoritative Product in aggregates.shopper.models when the
 * aggregate stores the service-derived copy.
 */
export const Product = makeModel(
  {
    abbreviation: 'prd',
    modelName: 'product',
    attributes: {
      name: primitives.text(),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

export const ProductReplica = makeReplica({
  sourceModel: Product,
  serviceName: 'app',
});

export const system = makeSystem({
  aggregates: {
    shopper: {
      models: {
        product: ProductReplica,
      },
    },
  },
  services: {
    app: {
      models: {
        product: Product,
      },
    },
  },
});

declare function makeModel(
  props: unknown,
  history: readonly unknown[],
): unknown;
declare function makeReplica(props: {
  sourceModel: unknown;
  serviceName: string;
}): unknown;
declare function makeSystem(props: unknown): unknown;
declare const primitives: {
  text(): unknown;
};
