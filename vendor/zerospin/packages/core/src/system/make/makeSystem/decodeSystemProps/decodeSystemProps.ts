import type { IAnyError } from '@zerospin/error';
import { Layer, Schema } from 'effect';

import { AgentSessionSchema } from '../../../../agent/AgentSessionSchema.ts';
import { AggregateSchema } from '../../../../aggregate/make/makeAggregateVersion.ts';
import { ServiceVersionSchema } from '../../../../service/make/makeServiceVersion.ts';

const SystemPropsSchema = Schema.Struct({
  name: Schema.String,
  agents: Schema.optionalKey(Schema.Record(Schema.String, AgentSessionSchema)),
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
    Schema.Record(
      Schema.String,
      Schema.Record(Schema.String, ServiceVersionSchema),
    ),
  ),
});

export function decodeSystemProps(props: unknown) {
  const decoded = Schema.decodeUnknownSync(SystemPropsSchema, {
    onExcessProperty: 'error',
  })(props);
  return {
    name: decoded.name,
    agents: decoded.agents ?? {},
    layer: decoded.layer,
    aggregates: decoded.aggregates,
    services: decoded.services ?? {},
  };
}
