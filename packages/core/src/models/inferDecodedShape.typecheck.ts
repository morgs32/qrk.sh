import { assert, type Equals } from 'tsafe';

import { makeModel } from './makeModel.ts';
import { primitives } from './primitives.ts';
import type {
  InferCommandPayload,
  InferDecodedRow,
  InferPayloadInput,
} from './types.ts';

const Widget = makeModel(
  {
    abbreviation: 'wdg',
    modelName: 'widget',
    attributes: {
      title: primitives.text(),
    },
    indexes: [],
    version: '1.0.0',
  },
  [],
);

const widgetPayloadShape = {
  id: Widget.primaryKey({ autogenerate: false }),
  title: primitives.text(),
} as const;

const widgetAutogeneratePayloadShape = {
  id: Widget.primaryKey({ autogenerate: true }),
  title: primitives.text(),
} as const;

const widgetDefaultedPayloadShape = {
  id: Widget.primaryKey({ autogenerate: false }),
  enabled: primitives.boolean({ defaultValue: true }),
  count: primitives.integer({ defaultValue: 5 }),
  ratio: primitives.number({ defaultValue: 1.5 }),
  label: primitives.text({ defaultValue: 'ready' }),
  createdAt: primitives.date({ defaultValue: new Date(0) }),
  status: primitives.enum({
    values: ['ready', 'done'],
    defaultValue: 'ready',
  }),
  title: primitives.text(),
} as const;

const widgetPrimaryKeyPayloadShape = {
  id: primitives.primaryKey({ abbreviation: 'wdg' }),
  title: primitives.text(),
} as const;

assert<
  Equals<
    InferDecodedRow<typeof widgetPayloadShape>,
    {
      readonly id: `wdg_${string}`;
      readonly title: string;
    }
  >
>();

// `autogenerate` does not affect nullability in the decoded shape
assert<
  Equals<
    InferDecodedRow<typeof widgetAutogeneratePayloadShape>,
    {
      readonly id: `wdg_${string}`;
      readonly title: string;
    }
  >
>();

// `autogenerate: true` ids are optional in the payload input
assert<
  Equals<
    InferPayloadInput<typeof widgetAutogeneratePayloadShape>,
    {
      readonly id?: `wdg_${string}` | null | undefined;
      readonly title: string;
    }
  >
>();

// `autogenerate: true` id may be omitted entirely
const omittedAutogenerateId: InferPayloadInput<
  typeof widgetAutogeneratePayloadShape
> = {
  title: 'Widget',
};
void omittedAutogenerateId;

assert<
  Equals<
    InferPayloadInput<typeof widgetDefaultedPayloadShape>,
    {
      readonly id: `wdg_${string}`;
      readonly enabled?: boolean;
      readonly count?: number;
      readonly ratio?: number;
      readonly label?: string;
      readonly createdAt?: Date;
      readonly status?: 'ready' | 'done';
      readonly title: string;
    }
  >
>();

assert<
  Equals<
    InferCommandPayload<typeof widgetDefaultedPayloadShape>,
    {
      readonly id: `wdg_${string}`;
      readonly enabled: boolean;
      readonly count: number;
      readonly ratio: number;
      readonly label: string;
      readonly createdAt: Date;
      readonly status: 'ready' | 'done';
      readonly title: string;
    }
  >
>();

const omittedDefaultedScalars: InferPayloadInput<
  typeof widgetDefaultedPayloadShape
> = {
  id: 'wdg_1',
  title: 'Widget',
};
void omittedDefaultedScalars;

assert<
  Equals<
    InferDecodedRow<typeof widgetPrimaryKeyPayloadShape>,
    {
      readonly id: `wdg_${string}`;
      readonly title: string;
    }
  >
>();

// @ts-expect-error Property 'id' is missing
const missingIdOnConcrete: InferDecodedRow<typeof widgetPayloadShape> = {
  title: 'Widget',
};
void missingIdOnConcrete;
