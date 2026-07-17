import { Effect } from 'effect';

declare function jitiImport(path: string): Promise<unknown>;

/**
 * Narrow unknown dynamic module exports with runtime checks — do not `as`-cast blindly.
 *
 * @bad `const system = (loadedModule as { system: System }).system` without validation.
 */
export const loadSystemModule = Effect.fn('loadSystemModule')(
  function* (props: { systemPath: string }) {
    const { systemPath } = props;
    const loadedModule = yield* Effect.tryPromise(() => jitiImport(systemPath));

    if (
      typeof loadedModule !== 'object' ||
      loadedModule === null ||
      !('system' in loadedModule)
    ) {
      throw new Error('System module must export const system: System');
    }

    return loadedModule.system;
  },
);
