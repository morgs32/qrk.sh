import { AsyncLive } from '@zerospin/core/async/AsyncLive';
import { ManagedRuntime } from 'effect';

const layer = AsyncLive;

// oxlint-disable-next-line import/no-default-export -- Bundler replacement for the generic runtime fixture.
export default { system: { runtime: ManagedRuntime.make(layer) } };
