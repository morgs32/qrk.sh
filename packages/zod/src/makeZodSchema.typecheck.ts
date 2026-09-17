import {
  primitives,
  type InferDecodedRow,
  type IShape,
} from '@zerospin/schema';
import { Schema } from 'effect';
import { assert, type Equals } from 'tsafe';
import type { z } from 'zod';

import { makeZodSchema } from './makeZodSchema.ts';

const TinyJsonRowSchema = Schema.Struct({ x: Schema.String });

const shape = {
  id: primitives.primaryKey({ abbreviation: 'usr' }),
  flag: primitives.boolean(),
  count: primitives.integer({ defaultValue: 5 }),
  name: primitives.text({ nullable: true }),
  status: primitives.enum({ values: ['open', 'closed'] }),
  payload: primitives.json({ schema: TinyJsonRowSchema }),
  createdAt: primitives.date(),
} satisfies IShape;

const schema = makeZodSchema(shape);

type IDecoded = InferDecodedRow<typeof shape>;
type IInferred = z.infer<typeof schema>;

assert<Equals<IInferred['id'], IDecoded['id']>>();
assert<Equals<IInferred['flag'], IDecoded['flag']>>();
assert<Equals<IInferred['count'], IDecoded['count']>>();
assert<Equals<IInferred['name'], IDecoded['name']>>();
assert<Equals<IInferred['status'], IDecoded['status']>>();
assert<Equals<IInferred['createdAt'], IDecoded['createdAt']>>();
assert<Equals<IInferred['payload'], IDecoded['payload']>>();
