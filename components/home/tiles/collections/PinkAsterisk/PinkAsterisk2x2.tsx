import { TileFrame } from '../../TileFrame';
import { PinkAsteriskGraphic } from './PinkAsteriskGraphic';

export function PinkAsterisk2x2() {
  return (
    <TileFrame backgroundClassName="bg-[#F5D6D0]" textClassName="text-foreground">
      <PinkAsteriskGraphic />
    </TileFrame>
  );
}
