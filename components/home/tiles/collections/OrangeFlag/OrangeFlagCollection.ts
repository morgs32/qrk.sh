import type { ITileCollection } from '../../types';
import { OrangeFlag1x1 } from './OrangeFlag1x1';
import { OrangeFlag2x2 } from './OrangeFlag2x2';
import { OrangeFlag4x1 } from './OrangeFlag4x1';

export const orangeFlagCollection: ITileCollection = {
  collectionId: 'orange-flag',
  collectionLabel: 'Orange flag',
  components: {
    '1x1': OrangeFlag1x1,
    '2x2': OrangeFlag2x2,
    '4x1': OrangeFlag4x1
  }
};
