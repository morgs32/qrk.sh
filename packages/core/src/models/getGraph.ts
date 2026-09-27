import { Schema } from 'effect';

import type { IUnstableGraph } from '../system/types.ts';

import {
  selectAllFromSelection,
  type ISelection,
  type ISelectionDb,
} from './makeSelection.ts';
import type { IAnyModels, IEncodedResourceShape, IModel } from './types.ts';

export const getGraph = (props: {
  db: ISelectionDb;
  identity: Readonly<Record<string, string>>;
  models: IAnyModels;
  selections: Record<string, ISelection<IModel>>;
}): IUnstableGraph => {
  const { db, identity, models, selections } = props;
  const graph: IUnstableGraph = {};

  for (const selection of Object.values(selections)) {
    for (const row of Schema.decodeUnknownSync(
      Schema.Array(Schema.Record(Schema.String, Schema.Unknown)),
    )(
      selectAllFromSelection({
        db,
        models,
        selection,
        identity,
      }).all(),
    )) {
      const record = row;
      const id = record.id;
      if (typeof id === 'string') {
        graph[id] = record as IEncodedResourceShape;
      }
    }
  }

  return graph;
};
