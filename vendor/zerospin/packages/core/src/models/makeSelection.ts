import type { IDb } from '../drizzle/types.ts';

import type { ISelection } from './make/makeActorDbVersion.ts';
import type { IAnyModels } from './types.ts';
export type { ISelection } from './make/makeActorDbVersion.ts';
export type ISelectionDb = Pick<IDb, '_'>;

export function assertSelectionQueryModels(props: {
  selection: ISelection;
  models: IAnyModels;
}): void {
  for (const [name, model] of Object.entries(props.selection.models)) {
    if (props.models[name] !== model) {
      throw new Error(
        `Selection database model ${name} differs from the registered model`,
      );
    }
  }
}

export function selectAllFromSelection(props: {
  db: ISelectionDb;
  models: IAnyModels;
  selection: ISelection;
  identity: Readonly<Record<string, string>>;
}) {
  assertSelectionQueryModels(props);
  return { all: () => props.selection.all(props.db, props.identity) };
}
