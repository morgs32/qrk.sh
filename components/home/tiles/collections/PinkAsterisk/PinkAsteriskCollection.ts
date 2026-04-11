import type { ITileCollection } from '../../types';
import { PinkAsterisk1x1 } from './PinkAsterisk1x1';
import { PinkAsterisk2x2 } from './PinkAsterisk2x2';
import { PinkAsterisk4x1 } from './PinkAsterisk4x1';

export const pinkAsteriskCollection: ITileCollection = {
  collectionId: 'pink-asterisk',
  collectionLabel: 'Pink asterisk',
  components: {
    '1x1': PinkAsterisk1x1,
    '2x2': PinkAsterisk2x2,
    '4x1': PinkAsterisk4x1
  }
};
