import type { ITileCollection } from '../../types';
import { GreenArch1x1 } from './GreenArch1x1';
import { GreenArch2x2 } from './GreenArch2x2';
import { GreenArch4x1 } from './GreenArch4x1';

export const greenArchCollection: ITileCollection = {
  collectionId: 'green-arch',
  collectionLabel: 'Green arch',
  components: {
    '1x1': GreenArch1x1,
    '2x2': GreenArch2x2,
    '4x1': GreenArch4x1
  }
};
