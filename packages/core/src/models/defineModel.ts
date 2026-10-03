import { Schema } from 'effect';

const modelIdentity = Symbol.for('@zerospin/core/Model');
export class Model {
  readonly [modelIdentity] = true;
}
export function defineModel<
  const NAME extends string,
  const ABBREVIATION extends string,
>(props: { name: NAME; abbreviation: ABBREVIATION }) {
  Schema.decodeUnknownSync(
    Schema.Struct({ name: Schema.String, abbreviation: Schema.String }),
    {
      onExcessProperty: 'error',
    },
  )(props);
  return { name: props.name, abbreviation: props.abbreviation };
}
