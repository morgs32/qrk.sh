import { makeTile } from '../../makeTile';
import { makeTileCollection } from '../../makeTileCollection';
import { PinkAsterisk1x1 } from './PinkAsterisk1x1';
import { PinkAsterisk2x2 } from './PinkAsterisk2x2';
import { PinkAsterisk4x1 } from './PinkAsterisk4x1';

export const pinkAsteriskCollection = makeTileCollection({
  collectionId: 'pink-asterisk',
  collectionLabel: 'Pink asterisk',
  tiles: [
    makeTile({ w: 1, h: 1, component: PinkAsterisk1x1 }),
    makeTile({ w: 2, h: 2, component: PinkAsterisk2x2 }),
    makeTile({ w: 4, h: 1, component: PinkAsterisk4x1 })
  ]
});
