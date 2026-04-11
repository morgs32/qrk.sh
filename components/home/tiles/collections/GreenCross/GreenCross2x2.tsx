import { TileFrame } from '../../TileFrame';
import { GreenCrossGraphic } from './GreenCrossGraphic';

export function GreenCross2x2() {
  return (
    <TileFrame backgroundClassName="bg-[#4A7C59]" textClassName="text-black">
      <GreenCrossGraphic />
    </TileFrame>
  );
}
