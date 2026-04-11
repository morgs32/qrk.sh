import type { ITileCollection } from '../../types';
import { BlackMLogo1x1 } from './BlackMLogo1x1';
import { BlackMLogo2x2 } from './BlackMLogo2x2';
import { BlackMLogo4x1 } from './BlackMLogo4x1';

export const blackMCollection: ITileCollection = {
  collectionId: 'black-m-logo',
  collectionLabel: 'Black M',
  components: {
    '1x1': BlackMLogo1x1,
    '2x2': BlackMLogo2x2,
    '4x1': BlackMLogo4x1
  }
};
