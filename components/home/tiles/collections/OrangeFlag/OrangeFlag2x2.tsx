import { TileFrame } from '../../TileFrame';
import { OrangeFlagGraphic } from './OrangeFlagGraphic';

export function OrangeFlag2x2() {
  return (
    <TileFrame backgroundClassName="bg-[#E86F3A]" textClassName="text-black">
      <OrangeFlagGraphic />
    </TileFrame>
  );
}
