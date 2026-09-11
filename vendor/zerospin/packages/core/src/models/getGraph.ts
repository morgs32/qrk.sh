import type { IUnstableGraph } from '../system/types.ts';

import {
  selectAllFromSelection,
  type ISelection,
  type ISelectionDb,
} from './makeSelection.ts';
import type { IAnyModels, IEncodedResourceShape, IModel } from './types.ts';

export const getGraph = (props: {
  db: ISelectionDb;
  authentication: Readonly<Record<string, string>>;
  models: IAnyModels;
  selections: Record<string, ISelection<IModel>>;
  whereByModelName?: Readonly<
    Record<string, Readonly<Record<string, unknown>>>
  >;
}): IUnstableGraph => {
  const { db, authentication, models, selections, whereByModelName } = props;
  const graph: IUnstableGraph = {};

  for (const [modelName, selection] of Object.entries(selections)) {
    for (const row of selectAllFromSelection({
      db,
      models,
      selection,
      authentication,
      ...(whereByModelName?.[modelName] === undefined
        ? {}
        : { where: whereByModelName[modelName] }),
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
