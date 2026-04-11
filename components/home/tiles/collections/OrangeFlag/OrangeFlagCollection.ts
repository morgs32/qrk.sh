import { makeTile } from '../../makeTile';
import { makeTileCollection } from '../../makeTileCollection';
import { OrangeFlag1x1 } from './OrangeFlag1x1';
import { OrangeFlag2x2 } from './OrangeFlag2x2';
import { OrangeFlag4x1 } from './OrangeFlag4x1';

export const orangeFlagCollection = makeTileCollection({
  collectionId: 'orange-flag',
  collectionLabel: 'Orange flag',
  tiles: [
    makeTile({ w: 1, h: 1, component: OrangeFlag1x1 }),
    makeTile({ w: 2, h: 2, component: OrangeFlag2x2 }),
    makeTile({ w: 4, h: 1, component: OrangeFlag4x1 })
  ]
});
