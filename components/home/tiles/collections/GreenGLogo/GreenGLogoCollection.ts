import type { ITileCollection } from '../../types';
import { GreenGLogo1x1 } from './GreenGLogo1x1';
import { GreenGLogo2x2 } from './GreenGLogo2x2';
import { GreenGLogo4x1 } from './GreenGLogo4x1';

export const greenGCollection: ITileCollection = {
  collectionId: 'green-g-logo',
  collectionLabel: 'Green G',
  components: {
    '1x1': GreenGLogo1x1,
    '2x2': GreenGLogo2x2,
    '4x1': GreenGLogo4x1
  }
};
