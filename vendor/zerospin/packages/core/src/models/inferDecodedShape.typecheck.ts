import { primitives, type InferDecodedRow } from '@zerospin/schema';
import { assert, type Equals } from 'tsafe';

import type { InferCommandPayload, InferPayloadInput } from './types.ts';

import { models } from './index.ts';

const WidgetModel = models.makeModel({ name: 'widget', abbreviation: 'wdg' });

const _Widget = models.makeVersion(WidgetModel, {
  attributes: {
    title: primitives.text(),
  },
  indexes: [],
  version: '1.0.0',
});

const widgetPayloadShape = {
  id: primitives.foreignKey({ abbreviation: WidgetModel.abbreviation }),
  title: primitives.text(),
} as const;

const widgetDefaultedPayloadShape = {
  id: primitives.foreignKey({ abbreviation: WidgetModel.abbreviation }),
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

// @ts-expect-error Contract input requires a caller-supplied ID.
const missingPayloadId: InferPayloadInput<typeof widgetPayloadShape> = {
  title: 'Widget',
};
void missingPayloadId;

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
