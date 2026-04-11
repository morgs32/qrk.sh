import type { ITileCollection } from '../../types';
import { CreamBench1x1 } from './CreamBench1x1';
import { CreamBench2x2 } from './CreamBench2x2';
import { CreamBench4x1 } from './CreamBench4x1';

export const creamBenchCollection: ITileCollection = {
  collectionId: 'cream-bench',
  collectionLabel: 'Cream bench',
  components: {
    '1x1': CreamBench1x1,
    '2x2': CreamBench2x2,
    '4x1': CreamBench4x1
  }
};
