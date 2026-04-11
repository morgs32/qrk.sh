import type { ITileCollection } from '../../types';
import { TextTile2x2 } from './TextTile2x2';
import { TextTile4x1 } from './TextTile4x1';

export const textTileCollection: ITileCollection = {
  collectionId: 'text-tile',
  collectionLabel: 'Text tile',
  components: {
    '2x2': TextTile2x2,
    '4x1': TextTile4x1
  }
};
