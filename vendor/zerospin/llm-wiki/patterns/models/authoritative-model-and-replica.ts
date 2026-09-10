import { models } from '@zerospin/sdk/browser';
/**
 * Define service-owned data with models.makeVersion, derive aggregate-held copies with
 * makeReplica, and register each model only with its owner. Use
 * Model.isReplica before reading canonical replica provenance. The direct
 * sourceModel and serviceName getters are intentionally absent from spread,
 * Object.keys, and JSON output; explicitly copy them only when deriving a
 * structural source-model record. Use authoritative models in direct service
 * frontends and replicas in aggregate frontends and selections. Use
 * Product.resourceSchema for authoritative payloads and
 * a contract model binding such as models.product.replicate for aggregate replication.
 *
 * makeReplica.modelVersion must equal sourceModel.version;
 * aggregate.services independently pins the supplying service snapshot. Validate
 * that each aggregate definition's replicas match the
 * model versions exposed by its service pins. VAR fetches initial copies from
 * the pinned VSR and installs them before guards inside the command savepoint.
 * VAR and UVAR then subscribe directly to that version's VSFC; service updates
 * advance independent source cursors without entering AAC or VAFC. UVAR emits
 * one userIndex per aggregate or service input while retaining aggregateIndex
 * as its consumed aggregate watermark. Standalone service frontends use VSRR.
 *
 * @bad Add serviceName or deletedAt to models.makeVersion; service ownership and replica
 * tombstones are not intrinsic authoritative-model fields.
 * @bad Register ProductReplica in services.app.models.
 * @bad Register the authoritative Product in aggregates.shopper.models when the
 * aggregate stores the service-derived copy.
 * @bad Detect a canonical replica with 'sourceModel' in model or by reflecting
 * its provenance fields.
 */
export const Product = models.makeVersion(
  models.makeModel({ name: 'product', abbreviation: 'prd' }),
  {
    attributes: {
      name: primitives.text(),
    },
    indexes: [],
    version: '1.0.0',
  },
);

export const ProductReplica = makeReplica({
  sourceModel: Product,
  serviceName: 'app',
  modelVersion: '1.0.0',
});

const appV1 = makeService({
  name: 'app',
  version: '1.0.0',
  models: {
    product: Product,
  },
});

export const system = makeSystem({
  aggregates: {
    shopper: aggregates.makeVersion(
      aggregates.makeAggregate({ name: 'shopper' }),
      {
        services: { app: appV1 },
        models: {
          product: ProductReplica,
        },
      },
    ),
  },
  services: {
    app: appV1,
  },
});

declare const aggregates: {
  makeAggregate(props: {
    name: string;
    layer?: unknown;
  }): Readonly<{ name: string; layer: unknown }>;
  makeVersion(
    identity: Readonly<{ name: string; layer: unknown }>,
    props: unknown,
  ): unknown;
};
declare function makeReplica(props: {
  sourceModel: unknown;
  serviceName: string;
  modelVersion: string;
}): unknown;
declare function makeService(props: unknown): unknown;
declare function makeSystem(props: unknown): unknown;
declare const primitives: {
  text(): unknown;
};
