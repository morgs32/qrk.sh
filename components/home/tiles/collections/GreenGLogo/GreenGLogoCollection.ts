import { makeTile } from '../../makeTile';
import { makeTileCollection } from '../../makeTileCollection';
import { GreenGLogo1x1 } from './GreenGLogo1x1';
import { GreenGLogo2x2 } from './GreenGLogo2x2';
import { GreenGLogo4x1 } from './GreenGLogo4x1';

export const greenGCollection = makeTileCollection({
  collectionId: 'green-g-logo',
  collectionLabel: 'Green G',
  tiles: [
    makeTile({ w: 1, h: 1, component: GreenGLogo1x1 }),
    makeTile({ w: 2, h: 2, component: GreenGLogo2x2 }),
    makeTile({ w: 4, h: 1, component: GreenGLogo4x1 })
  ]
});
