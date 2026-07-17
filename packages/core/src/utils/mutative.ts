import type { IAnyError } from '@zerospin/error';
import { Effect } from 'effect';
import { apply, create, makeCreator, type Draft, type Patch } from 'mutative';

const patch = makeCreator({
  enablePatches: {
    pathAsArray: true,
  },
});

export function produce<T>(base: T, mutate: (draft: Draft<T>) => void) {
  return create(base, mutate);
}

produce.create = create;

produce.effect = Effect.fn('produce')(function* <T, ERROR extends IAnyError>(
  base: T,
  mutate: (draft: Draft<T>) => Effect.Effect<void, ERROR>,
) {
  const [draft, finalize] = create(base);
  yield* mutate(draft);
  return finalize();
});

produce.patch = <T>(base: T, mutate: (draft: Draft<T>) => void) => {
  const [produced, patches, inverse] = patch(base, mutate);
  return {
    inverse,
    patches,
    produced,
  };
};

produce.applyPatches = function applyPatches<T extends object>(
  base: T,
  patches: Patch[],
) {
  return apply(base, patches);
};
