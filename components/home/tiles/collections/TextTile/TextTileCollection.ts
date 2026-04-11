import { makeTile } from '../../makeTile';
import { makeTileCollection } from '../../makeTileCollection';
import { TextTile2x2 } from './TextTile2x2';
import { TextTile4x1 } from './TextTile4x1';

export const textTileCollection = makeTileCollection({
  collectionId: 'text-tile',
  collectionLabel: 'Text tile',
  tiles: [
    makeTile({ w: 2, h: 2, component: TextTile2x2 }),
    makeTile({ w: 4, h: 1, component: TextTile4x1 })
  ]
});
