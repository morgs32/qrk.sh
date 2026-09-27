import { defineModel } from '@zerospin/core/models/defineModel';
import { makeModelVersion } from '@zerospin/core/models/make/makeModelVersion';

/**
 * Define service-owned data with makeModelVersion, derive aggregate-held copies with
 * makeReplica, and register each model only with its owner. Use
 * Model.isReplica before reading canonical replica provenance. The direct
 * sourceModel and serviceName getters are intentionally absent from spread,
 * Object.keys, and JSON output; explicitly copy them only when deriving a
 * structural source-model record. Use authoritative models in direct service
 * sessions and replicas in aggregate sessions and selections. Use
 * Product.resourceSchema for authoritative payloads and
 * a contract model binding such as models.product.replicate for aggregate replication.
 *
 * makeReplica.modelVersion must equal sourceModel.version;
 * aggregate.services independently pins the supplying service snapshot. Validate
 * that each aggregate definition's replicas match the
 * model versions exposed by its service pins. VAR fetches initial copies from
 * the pinned VSR and installs them before guards inside the command savepoint.
 * VAR and ActorVAR then subscribe directly to that version's VSFC; service updates
 * advance independent source cursors without entering AAC or VAFC. ActorVAR emits
 * one executedIndex per aggregate or service input while retaining aggregateIndex
 * as its consumed aggregate watermark. Standalone service sessions use VSRR.
 *
 * @bad Add serviceName or deletedAt to makeModelVersion; service ownership and replica
 * tombstones are not intrinsic authoritative-model fields.
 * @bad Register productReplica in services.app.models.
 * @bad Register the authoritative Product in aggregates.shopper.models when the
 * aggregate stores the service-derived copy.
 * @bad Detect a canonical replica with 'sourceModel' in model or by reflecting
 * its provenance fields.
 */
export const product = makeModelVersion(
  defineModel({ name: 'product', abbreviation: 'prd' }),
  {
    attributes: {
      name: primitives.text(),
    },
    indexes: [],
    version: '1.0.0',
  },
);

export const productReplica = makeReplica({
  sourceModel: product,
  serviceName: 'app',
  modelVersion: '1.0.0',
});

const appV1 = makeService({
  name: 'app',
  version: '1.0.0',
  models: {
    product: product,
  },
});

export const system = makeSystem({
  aggregates: {
    shopper: makeAggregateVersion(defineAggregate({ name: 'shopper' }), {
      services: { app: appV1 },
      models: {
        product: productReplica,
      },
    }),
  },
  services: {
    app: appV1,
  },
});

declare const aggregates: {
  defineAggregate(props: {
    name: string;
    layer?: unknown;
  }): Readonly<{ name: string; layer: unknown }>;
  makeAggregateVersion(
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
