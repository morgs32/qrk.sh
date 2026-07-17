import type { IUnstableGraph } from '../system/types.ts';

import {
  selectAllFromSelection,
  type ISelection,
  type ISelectionDb,
} from './makeSelection.ts';
import type {
  IActorId,
  IEncodedResourceShape,
  IModel,
  IModels,
} from './types.ts';

export const getGraph = (props: {
  db: ISelectionDb;
  actorId: IActorId;
  models: IModels;
  selections: Record<string, ISelection<IModel>>;
}): IUnstableGraph => {
  const { db, actorId, models, selections } = props;
  const graph: IUnstableGraph = {};

  for (const selection of Object.values(selections)) {
    for (const row of selectAllFromSelection({
      db,
      models,
      selection,
      actorId,
    }).all()) {
      const record = row as Record<string, unknown>;
      const id = record.id;
      if (typeof id === 'string') {
        graph[id] = record as IEncodedResourceShape;
      }
    }
  }

  return graph;
};
