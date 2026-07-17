import type { IAnyError } from '@zerospin/error';
import { Context, type Effect } from 'effect';

import type { IRef } from './types.ts';

export type IStorageAdapter = {
  check: () => Effect.Effect<void, IAnyError>;
  clear: (props: { storageId: string }) => Effect.Effect<void, IAnyError>;
  load(props: {
    storageId: string;
  }): Effect.Effect<readonly unknown[], IAnyError>;
  save: (props: {
    items: IRef[];
    storageId: string;
  }) => Effect.Effect<void, IAnyError>;
};

export class StorageAdapter extends Context.Tag('StorageAdapter')<
  StorageAdapter,
  IStorageAdapter
>() {}
