import { TileFrame } from '../../TileFrame';
import { PinkAsteriskGraphic } from './PinkAsteriskGraphic';

export function PinkAsterisk4x1() {
  return (
    <TileFrame backgroundClassName="bg-[#F5D6D0]" textClassName="text-foreground">
      <PinkAsteriskGraphic />
    </TileFrame>
  );
}
