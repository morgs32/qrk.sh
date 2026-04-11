import { TileFrame } from '../../TileFrame';
import { BlackMLogoGraphic } from './BlackMLogoGraphic';

export function BlackMLogo2x2() {
  return (
    <TileFrame backgroundClassName="bg-[#1A1A1A]" textClassName="text-white">
      <BlackMLogoGraphic />
    </TileFrame>
  );
}
