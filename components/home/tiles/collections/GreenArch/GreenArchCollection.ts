import { makeTile } from '../../makeTile';
import { makeTileCollection } from '../../makeTileCollection';
import { GreenArch1x1 } from './GreenArch1x1';
import { GreenArch2x2 } from './GreenArch2x2';
import { GreenArch4x1 } from './GreenArch4x1';

export const greenArchCollection = makeTileCollection({
  collectionId: 'green-arch',
  collectionLabel: 'Green arch',
  tiles: [
    makeTile({ w: 1, h: 1, component: GreenArch1x1 }),
    makeTile({ w: 2, h: 2, component: GreenArch2x2 }),
    makeTile({ w: 4, h: 1, component: GreenArch4x1 })
  ]
});
