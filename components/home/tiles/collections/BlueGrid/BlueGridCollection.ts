import type { ITileCollection } from '../../types';
import { BlueGrid1x1 } from './BlueGrid1x1';
import { BlueGrid2x2 } from './BlueGrid2x2';
import { BlueGrid4x1 } from './BlueGrid4x1';

export const blueGridCollection: ITileCollection = {
  collectionId: 'blue-grid',
  collectionLabel: 'Blue grid',
  components: {
    '1x1': BlueGrid1x1,
    '2x2': BlueGrid2x2,
    '4x1': BlueGrid4x1
  }
};
