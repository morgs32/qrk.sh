import type { ITileCollection } from '../../types';
import { OrangeBlocks1x1 } from './OrangeBlocks1x1';
import { OrangeBlocks2x2 } from './OrangeBlocks2x2';
import { OrangeBlocks4x1 } from './OrangeBlocks4x1';

export const orangeBlocksCollection: ITileCollection = {
  collectionId: 'orange-block',
  collectionLabel: 'Orange blocks',
  components: {
    '1x1': OrangeBlocks1x1,
    '2x2': OrangeBlocks2x2,
    '4x1': OrangeBlocks4x1
  }
};
