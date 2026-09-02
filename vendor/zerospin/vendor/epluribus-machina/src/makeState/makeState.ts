import { Schema } from 'effect';

import { State } from './State.js';

const StrictParseOptions = { onExcessProperty: 'error' } as const;
const reservedStateFields = ['stateName', 'commands'] as const;

const isStateInputFields = (
  value: unknown,
): value is Schema.Struct.Fields => {
  if (typeof value !== 'object' || value === null || Schema.isSchema(value)) {
    return false;
  }
  return Reflect.ownKeys(value).every(
    key =>
      typeof key === 'string' &&
      Schema.isSchema(Reflect.get(value, key)),
  );
};

const StateInputSchema = Schema.declare<Schema.Struct.Fields>(
  isStateInputFields,
).check(
  Schema.makeFilter(input => {
    for (const field of reservedStateFields) {
      if (Object.hasOwn(input, field)) {
        return `State input must not declare "${field}"`;
      }
    }
    return undefined;
  }),
);

const StateNameSchema = Schema.String.check(
  Schema.makeFilter(name =>
    name === '__proto__' ? 'State name must not be "__proto__"' : undefined,
  ),
);

const StatePropsSchema = Schema.Struct({
  stateName: StateNameSchema,
  input: StateInputSchema,
});

type ITypeError<MESSAGE extends string> = {
  readonly __typeError: MESSAGE;
};

type IRejectKey<FIELDS, KEY extends string> = KEY extends keyof FIELDS
  ? ITypeError<`State input must not declare "${KEY}"`>
  : unknown;

type IRejectReservedStateInput<FIELDS extends Schema.Struct.Fields> =
  IRejectKey<FIELDS, 'stateName'> & IRejectKey<FIELDS, 'commands'>;

type IRejectProtoStateName<NAME extends string> = NAME extends '__proto__'
  ? never
  : NAME;

export const makeState = <
  const NAME extends string,
  const FIELDS extends Schema.Struct.Fields,
>(props: {
  readonly stateName: IRejectProtoStateName<NAME>;
  readonly input: FIELDS & IRejectReservedStateInput<FIELDS>;
}): State<NAME, FIELDS> => {
  const decoded = Schema.decodeUnknownSync(
    StatePropsSchema,
    StrictParseOptions,
  )(props);
  // ALLOWED_CAST: StatePropsSchema retained the authored stateName literal and
  // field map reference after strict runtime validation.
  const { input, stateName } = decoded as {
    readonly stateName: NAME;
    readonly input: FIELDS;
  };

  const schema = Schema.Struct({
    stateName: Schema.tag(stateName),
    ...input,
  });

  return new State({ stateName, input, schema });
};
