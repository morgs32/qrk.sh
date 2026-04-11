import { makeTile } from '../../makeTile';
import { makeTileCollection } from '../../makeTileCollection';
import { PinkDots1x1 } from './PinkDots1x1';
import { PinkDots2x2 } from './PinkDots2x2';
import { PinkDots4x1 } from './PinkDots4x1';

export const pinkDotsCollection = makeTileCollection({
  collectionId: 'pink-dots',
  collectionLabel: 'Pink dots',
  tiles: [
    makeTile({ w: 1, h: 1, component: PinkDots1x1 }),
    makeTile({ w: 2, h: 2, component: PinkDots2x2 }),
    makeTile({ w: 4, h: 1, component: PinkDots4x1 })
  ]
});
