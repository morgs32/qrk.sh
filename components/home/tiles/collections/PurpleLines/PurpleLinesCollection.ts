import type { ITileCollection } from '../../types';
import { PurpleLines1x1 } from './PurpleLines1x1';
import { PurpleLines2x2 } from './PurpleLines2x2';
import { PurpleLines4x1 } from './PurpleLines4x1';

export const purpleLinesCollection: ITileCollection = {
  collectionId: 'purple-lines',
  collectionLabel: 'Purple lines',
  components: {
    '1x1': PurpleLines1x1,
    '2x2': PurpleLines2x2,
    '4x1': PurpleLines4x1
  }
};
