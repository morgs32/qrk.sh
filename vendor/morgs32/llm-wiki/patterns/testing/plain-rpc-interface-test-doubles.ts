import { vi } from 'vitest';

declare function encodeRight<T>(value: T): unknown;

declare class FrontendApi {
  getActorState(props: { actorId: string }): Promise<unknown>;
}

/**
 * RPC test doubles: type-annotate the const — do not end with `as IWhatever`.
 *
 * @bad `export const mockFrontendApi = { … } as FrontendApi` — hides shape mismatches.
 */
export const mockFrontendApi: Pick<FrontendApi, 'getActorState'> = {
  getActorState: vi.fn(async () =>
    encodeRight({
      actorId: 'act_1',
      resources: [],
    }),
  ),
};
