import { makeTile } from '../../makeTile';
import { makeTileCollection } from '../../makeTileCollection';
import { CreamSquare1x1 } from './CreamSquare1x1';
import { CreamSquare2x2 } from './CreamSquare2x2';
import { CreamSquare4x1 } from './CreamSquare4x1';

export const creamSquareCollection = makeTileCollection({
  collectionId: 'cream-square',
  collectionLabel: 'Cream square',
  tiles: [
    makeTile({ w: 1, h: 1, component: CreamSquare1x1 }),
    makeTile({ w: 2, h: 2, component: CreamSquare2x2 }),
    makeTile({ w: 4, h: 1, component: CreamSquare4x1 })
  ]
});
