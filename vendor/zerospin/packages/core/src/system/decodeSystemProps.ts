import { Layer, Schema } from 'effect';

import { AggregateSchema } from '../aggregate/makeVersion.ts';
import { AuthenticationSchema } from '../authentication/makeVersion.ts';
import { ServiceSchema } from '../service/makeService.ts';

const SystemPropsSchema = Schema.Struct({
  name: Schema.String,
  layer: Schema.optionalKey(Schema.declare(Layer.isLayer)),
  authentication: Schema.Array(AuthenticationSchema).check(
    Schema.makeFilter(
      definitions =>
        new Set(definitions.map(definition => definition.version)).size ===
          definitions.length || 'Duplicate authentication version',
    ),
  ),
  aggregates: Schema.Record(Schema.String, Schema.Array(AggregateSchema)),
  services: Schema.optionalKey(
    Schema.Record(Schema.String, Schema.Array(ServiceSchema)),
  ),
});

export function decodeSystemProps(props: unknown) {
  const decoded = Schema.decodeUnknownSync(SystemPropsSchema, {
    onExcessProperty: 'error',
  })(props);
  return {
    name: decoded.name,
    authentication: decoded.authentication,
    aggregates: decoded.aggregates,
    services: decoded.services ?? {},
  };
}
