import type { ITileCollection } from '../../types';
import { CreamSquare1x1 } from './CreamSquare1x1';
import { CreamSquare2x2 } from './CreamSquare2x2';
import { CreamSquare4x1 } from './CreamSquare4x1';

export const creamSquareCollection: ITileCollection = {
  collectionId: 'cream-square',
  collectionLabel: 'Cream square',
  components: {
    '1x1': CreamSquare1x1,
    '2x2': CreamSquare2x2,
    '4x1': CreamSquare4x1
  }
};
