import type { InferProps } from '../utils/types.ts';

import { makeModelAndMetadata, type makeModel } from './makeModel.ts';
import { primitives } from './primitives.ts';
import type {
  IDateDescriptor,
  IDrizzleIndexConfig,
  IModel,
  IPrimaryKeyDescriptor,
  IServiceModel,
  IShape,
  ITextDescriptor,
} from './types.ts';

/*
 * 1. Strip serviceName from props; keep model fields.
 * 2. Build the service model with explicit framework metadata.
 * 3. Assemble model + serviceName into a service model object.
 * 4. Seal serviceName as non-writable / non-configurable.
 * 5. Return the sealed IServiceModel.
 */
export function makeServiceModel<
  SERVICE_NAME extends string,
  MODEL_NAME extends string,
  ABBREVIATION extends string,
  ATTRIBUTES extends IShape,
  const VERSION extends string,
  const HISTORICAL_DEFINITIONS extends readonly {
    readonly abbreviation: string;
    readonly attributes: IShape;
    readonly indexes: readonly IDrizzleIndexConfig<string>[];
    readonly modelName: string;
    readonly version: string;
  }[],
>(
  props: InferProps<
    typeof makeModel<
      MODEL_NAME,
      ABBREVIATION,
      ATTRIBUTES,
      VERSION,
      HISTORICAL_DEFINITIONS
    >
  > & {
    serviceName: SERVICE_NAME;
  },
  historicalDefinitions: HISTORICAL_DEFINITIONS,
): IServiceModel<
  IModel<
    ATTRIBUTES,
    ABBREVIATION,
    MODEL_NAME,
    VERSION,
    HISTORICAL_DEFINITIONS,
    {
      id: IPrimaryKeyDescriptor<ABBREVIATION>;
      modelName: ITextDescriptor<false>;
      createdAt: IDateDescriptor<false>;
      updatedAt: IDateDescriptor<false>;
      version: ITextDescriptor<false>;
      deletedAt: IDateDescriptor<true>;
    }
  >,
  SERVICE_NAME
> {
  // 1 — pull serviceName out so it is not passed into makeModel
  const {
    serviceName,
    abbreviation,
    modelName,
    attributes,
    indexes = [],
    version,
  } = props;
  // 2 — service models own the complete metadata shape they pass into the shared model factory
  const model = makeModelAndMetadata<
    MODEL_NAME,
    ABBREVIATION,
    ATTRIBUTES,
    {
      id: IPrimaryKeyDescriptor<ABBREVIATION>;
      modelName: ITextDescriptor<false>;
      createdAt: IDateDescriptor<false>;
      updatedAt: IDateDescriptor<false>;
      version: ITextDescriptor<false>;
      deletedAt: IDateDescriptor<true>;
    },
    VERSION,
    HISTORICAL_DEFINITIONS
  >(
    {
      abbreviation,
      modelName,
      metadata: {
        id: primitives.primaryKey({ abbreviation }),
        modelName: primitives.text({ nullable: false }),
        createdAt: primitives.date({ nullable: false }),
        updatedAt: primitives.date({ nullable: false }),
        version: primitives.text({ nullable: false }),
        deletedAt: primitives.date({ nullable: true }),
      },
      attributes,
      indexes,
      version,
    },
    historicalDefinitions,
  );
  // 3 — attach ownership tag; TypeScript readonly alone does not lock this field
  const serviceModel = Object.assign(model, { serviceName });

  // 4 — freeze ownership for makeServiceController's model.serviceName === name gate
  Object.defineProperty(serviceModel, 'serviceName', {
    configurable: false,
    enumerable: true,
    value: serviceName,
    writable: false,
  });

  // 5 — sealed service-owned model (client-safe; no server-only import)
  return serviceModel;
}
