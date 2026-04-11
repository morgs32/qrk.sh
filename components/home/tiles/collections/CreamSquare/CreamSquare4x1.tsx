import { TileFrame } from '../../TileFrame';
import { CreamSquareGraphic } from './CreamSquareGraphic';

export function CreamSquare4x1() {
  return (
    <TileFrame backgroundClassName="bg-[#F5F0E6]" textClassName="text-foreground">
      <CreamSquareGraphic />
    </TileFrame>
  );
}
