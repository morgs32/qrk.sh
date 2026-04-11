import type { ITileCollection } from '../../types';
import { GreenEmpty1x1 } from './GreenEmpty1x1';
import { GreenEmpty2x2 } from './GreenEmpty2x2';
import { GreenEmpty4x1 } from './GreenEmpty4x1';

export const greenEmptyCollection: ITileCollection = {
  collectionId: 'green-empty',
  collectionLabel: 'Green empty',
  components: {
    '1x1': GreenEmpty1x1,
    '2x2': GreenEmpty2x2,
    '4x1': GreenEmpty4x1
  }
};
