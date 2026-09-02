import { Schema } from 'effect';

import { rethrowSchemaError } from '../rethrowSchemaError.js';

type IStateValue<
  NAME extends string,
  FIELDS extends Schema.Struct.Fields,
> = { readonly stateName: NAME } & Schema.Struct.Type<FIELDS>;

type IStateValueSchema<
  NAME extends string,
  FIELDS extends Schema.Struct.Fields,
> = Schema.ConstraintCodec<
  IStateValue<NAME, FIELDS>,
  { readonly stateName: NAME } & Schema.Struct.Encoded<FIELDS>,
  Schema.Struct.DecodingServices<FIELDS>,
  Schema.Struct.EncodingServices<FIELDS>
>;

/** Provenance marker for factory-produced State descriptors. */
export class State<
  NAME extends string = string,
  FIELDS extends Schema.Struct.Fields = Schema.Struct.Fields,
> {
  readonly stateName: NAME;
  readonly input: FIELDS;
  readonly schema: IStateValueSchema<NAME, FIELDS>;

  constructor(props: {
    readonly stateName: NAME;
    readonly input: FIELDS;
    readonly schema: Schema.Struct<any>;
  }) {
    this.stateName = props.stateName;
    this.input = props.input;
    // ALLOWED_CAST: makeState built this Struct from the tagged stateName and
    // authored field map after strict validation.
    this.schema = props.schema as unknown as IStateValueSchema<NAME, FIELDS>;
  }

  make(fields: Schema.Struct.MakeIn<FIELDS>): IStateValue<NAME, FIELDS> {
    try {
      // ALLOWED_CAST: runtime schema is the Struct makeState constructed.
      return (this.schema as unknown as Schema.Struct<any>).make(
        fields,
      ) as IStateValue<NAME, FIELDS>;
    } catch (error) {
      return rethrowSchemaError(error);
    }
  }
}

export const CanonicalStateSchema = Schema.instanceOf(State);
