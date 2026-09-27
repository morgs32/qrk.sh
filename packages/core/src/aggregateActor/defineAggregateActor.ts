import { Schema } from 'effect';

/** Stable name shared by the versions of an admitted aggregate view. */
export function defineAggregateActor<const NAME extends string>(props: {
  name: NAME;
}) {
  Schema.decodeUnknownSync(Schema.Struct({ name: Schema.String }), {
    onExcessProperty: 'error',
  })(props);
  return { name: props.name };
}
