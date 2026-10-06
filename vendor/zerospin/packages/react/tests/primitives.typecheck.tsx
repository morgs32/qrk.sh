import {
  ShapeForm,
  type IShapeFormProps,
  type primitiveInputsMap,
} from '@zerospin/react/primitives';
import {
  primitives,
  type InferDecodedRow,
  type PrimitiveKind,
} from '@zerospin/shapes';
import { Schema } from 'effect';
import { assert, type Equals } from 'tsafe';

const shape = {
  id: primitives.primaryKey({ abbreviation: 'itm' }),
  date: primitives.date(),
  state: primitives.enum({ values: ['open', 'closed'] }),
  data: primitives.json({ schema: Schema.Struct({ count: Schema.Number }) }),
  text: primitives.text({ nullable: true }),
};
const defaultValues: InferDecodedRow<typeof shape> = {
  id: 'itm_one',
  date: new Date(),
  state: 'open',
  data: { count: 1 },
  text: null,
};

export const typedForm = (
  <ShapeForm
    shape={shape}
    defaultValues={defaultValues}
    onSubmit={value => {
      assert<
        Equals<
          typeof value,
          {
            id: `itm_${string}`;
            date: Date;
            state: 'open' | 'closed';
            data: { readonly count: number };
            text: string | null;
          }
        >
      >();
    }}
  />
);

export const asyncForm = (
  <ShapeForm
    shape={shape}
    defaultValues={defaultValues}
    onSubmit={async value => {
      const date: Date = value.date;
      const count: number = value.data.count;
      void date;
      void count;
    }}
  />
);

export const incompleteDefaults: IShapeFormProps<typeof shape> = {
  shape,
  defaultValues: { id: 'itm_one' },
  disabled: true,
  onSubmit: () => {},
};

export const formWithoutDefaults = (
  <ShapeForm
    shape={shape}
    onSubmit={value => {
      assert<Equals<typeof value, InferDecodedRow<typeof shape>>>();
    }}
  />
);

export const emptyForm = (
  <ShapeForm
    shape={{}}
    onSubmit={value => {
      assert<Equals<typeof value, {}>>();
    }}
  />
);

export const encodedDefaults: IShapeFormProps<typeof shape> = {
  shape,
  // @ts-expect-error JSON defaults are decoded domain values, not encoded JSON strings.
  defaultValues: { ...defaultValues, data: '{"count":1}' },
  onSubmit: () => {},
};

assert<Equals<`${keyof typeof primitiveInputsMap}`, `${PrimitiveKind}`>>();
