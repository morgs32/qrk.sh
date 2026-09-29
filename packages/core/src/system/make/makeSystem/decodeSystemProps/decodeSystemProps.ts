import type { IAnyError } from '@zerospin/error';
import { Layer, Schema } from 'effect';

import { AggregateSchema } from '../../../../aggregate/make/makeAggregateVersion.ts';
import { MachineDeclarationSchema } from '../../../../machine/MachineDeclaration.ts';
import { VersionedServiceSchema } from '../../../../service/make/makeService.ts';

const SystemPropsSchema = Schema.Struct({
  name: Schema.String,
  layer: Schema.optionalKey(
    Schema.declare((input: unknown): input is Layer.Layer<unknown, IAnyError> =>
      Layer.isLayer(input),
    ),
  ),
  aggregates: Schema.Record(
    Schema.String,
    Schema.Record(Schema.String, AggregateSchema),
  ),
  services: Schema.optionalKey(
    Schema.Record(Schema.String, VersionedServiceSchema),
  ),
  machines: Schema.optionalKey(
    Schema.Record(Schema.String, MachineDeclarationSchema),
  ),
});

export function decodeSystemProps(props: unknown) {
  const decoded = Schema.decodeUnknownSync(SystemPropsSchema, {
    onExcessProperty: 'error',
  })(props);
  return {
    name: decoded.name,
    layer: decoded.layer,
    aggregates: decoded.aggregates,
    services: decoded.services ?? {},
    machines: decoded.machines ?? {},
  };
}
