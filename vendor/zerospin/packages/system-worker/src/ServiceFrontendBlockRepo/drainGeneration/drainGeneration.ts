import { Effect } from 'effect';

export const drainGeneration = Effect.fn(
  'ServiceFrontendBlockRepo.drainGeneration',
)(function* (props: {
  close: (code: number, reason: string) => void;
}): Effect.fn.Return<void> {
  props.close(1012, 'generation-drained');
});
