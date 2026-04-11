import type { ITileCollection } from '../../types';
import { PinkDots1x1 } from './PinkDots1x1';
import { PinkDots2x2 } from './PinkDots2x2';
import { PinkDots4x1 } from './PinkDots4x1';

export const pinkDotsCollection: ITileCollection = {
  collectionId: 'pink-dots',
  collectionLabel: 'Pink dots',
  components: {
    '1x1': PinkDots1x1,
    '2x2': PinkDots2x2,
    '4x1': PinkDots4x1
  }
};
