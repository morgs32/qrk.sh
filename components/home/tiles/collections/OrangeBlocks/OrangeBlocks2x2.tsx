import { TileFrame } from '../../TileFrame';
import { OrangeBlocksGraphic } from './OrangeBlocksGraphic';

export function OrangeBlocks2x2() {
  return (
    <TileFrame backgroundClassName="bg-[#E86F3A]" textClassName="text-black">
      <OrangeBlocksGraphic />
    </TileFrame>
  );
}
