import type { IAnyError } from '@zerospin/error';
import { Layer, Schema } from 'effect';

export function makeAggregate<
  const NAME extends string,
  SERVICES,
  REQUIREMENTS,
>(props: {
  name: NAME;
  layer: Layer.Layer<SERVICES, IAnyError, REQUIREMENTS>;
}): { name: NAME; layer: Layer.Layer<SERVICES, IAnyError, REQUIREMENTS> };
export function makeAggregate<const NAME extends string>(props: {
  name: NAME;
  layer?: never;
}): { name: NAME; layer: Layer.Layer<never> };
export function makeAggregate(props: {
  name: string;
  layer?: Layer.Layer<never, IAnyError, unknown>;
}): unknown {
  Schema.decodeUnknownSync(
    Schema.Struct({
      name: Schema.String,
      layer: Schema.optionalKey(Schema.declare(Layer.isLayer)),
    }),
    { onExcessProperty: 'error' },
  )(props);
  return { name: props.name, layer: props.layer ?? Layer.empty };
}
