import { TileFrame } from "../../TileFrame";
import { CreamSquareGraphic } from "./CreamSquareGraphic";

export function CreamSquare2x2() {
  return (
    <TileFrame backgroundClassName="bg-[#F5F0E6]" textClassName="text-foreground">
      <CreamSquareGraphic />
    </TileFrame>
  );
}
