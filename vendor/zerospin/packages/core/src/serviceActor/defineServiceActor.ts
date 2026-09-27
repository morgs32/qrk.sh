import { Schema } from 'effect';

/** Stable name shared by the versions of an admitted service view. */
export function defineServiceActor<const NAME extends string>(props: {
  name: NAME;
}) {
  Schema.decodeUnknownSync(Schema.Struct({ name: Schema.String }), {
    onExcessProperty: 'error',
  })(props);
  return { name: props.name };
}
