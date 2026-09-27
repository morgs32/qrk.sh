import { Schema } from 'effect';

export function defineAggregate<const NAME extends string>(props: {
  name: NAME;
}): { name: NAME } {
  const { name, ...extra } = props;
  Schema.decodeUnknownSync(Schema.Struct({ name: Schema.String }), {
    onExcessProperty: 'error',
  })({ name, ...extra });
  return { name };
}
