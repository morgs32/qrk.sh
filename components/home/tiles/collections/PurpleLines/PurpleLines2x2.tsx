import { TileFrame } from '../../TileFrame';
import { PurpleLinesGraphic } from './PurpleLinesGraphic';

export function PurpleLines2x2() {
  return (
    <TileFrame backgroundClassName="bg-[#8B7BB5]" textClassName="text-black">
      <PurpleLinesGraphic />
    </TileFrame>
  );
}
