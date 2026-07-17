import { Effect, Layer } from 'effect';
import { nanoid } from 'nanoid';

import { CuidFactory } from '../services/CuidFactory.ts';

export const NanoIdFactory = Layer.effect(
  CuidFactory,
  Effect.sync(() => CuidFactory.of(() => Effect.sync(() => nanoid()))),
);
