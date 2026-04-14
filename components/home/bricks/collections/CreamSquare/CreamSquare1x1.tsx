import { BrickFrame } from "../../BrickFrame";
import { CreamSquareGraphic } from "./CreamSquareGraphic";

export function CreamSquare1x1() {
  return (
    <BrickFrame backgroundClassName="bg-[#F5F0E6]" textClassName="text-foreground">
      <CreamSquareGraphic />
    </BrickFrame>
  );
}
