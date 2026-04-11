import { makeTileCollection } from '../../makeTileCollection';
import { BlackCircle1x1 } from './BlackCircle1x1';
import { BlackCircle2x2 } from './BlackCircle2x2';
import { BlackCircle4x1 } from './BlackCircle4x1';

export const blackCircleCollection = makeTileCollection({
  collectionId: 'black-circle',
  collectionLabel: 'Black circle',
  components: {
    '1x1': BlackCircle1x1,
    '2x2': BlackCircle2x2,
    '4x1': BlackCircle4x1
  }
});
