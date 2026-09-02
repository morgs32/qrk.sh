import { CuidFactory } from '@zerospin/schema';
import { Effect, Layer } from 'effect';
import { nanoid } from 'nanoid';

export const NanoIdFactory = Layer.effect(
  CuidFactory,
  Effect.sync(() => CuidFactory.of(() => Effect.sync(() => nanoid()))),
);
