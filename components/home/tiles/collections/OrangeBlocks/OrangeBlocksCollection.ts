import { makeTile } from '../../makeTile';
import { makeTileCollection } from '../../makeTileCollection';
import { OrangeBlocks1x1 } from './OrangeBlocks1x1';
import { OrangeBlocks2x2 } from './OrangeBlocks2x2';
import { OrangeBlocks4x1 } from './OrangeBlocks4x1';

export const orangeBlocksCollection = makeTileCollection({
  collectionId: 'orange-block',
  collectionLabel: 'Orange blocks',
  tiles: [
    makeTile({ w: 1, h: 1, component: OrangeBlocks1x1 }),
    makeTile({ w: 2, h: 2, component: OrangeBlocks2x2 }),
    makeTile({ w: 4, h: 1, component: OrangeBlocks4x1 })
  ]
});
