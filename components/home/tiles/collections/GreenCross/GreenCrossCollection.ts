import type { ITileCollection } from '../../types';
import { GreenCross1x1 } from './GreenCross1x1';
import { GreenCross2x2 } from './GreenCross2x2';
import { GreenCross4x1 } from './GreenCross4x1';

export const greenCrossCollection: ITileCollection = {
  collectionId: 'green-cross',
  collectionLabel: 'Green cross',
  components: {
    '1x1': GreenCross1x1,
    '2x2': GreenCross2x2,
    '4x1': GreenCross4x1
  }
};
