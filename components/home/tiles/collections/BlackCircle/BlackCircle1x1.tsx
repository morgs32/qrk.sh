import { TileFrame } from "../../TileFrame";
import { BlackCircleGraphic } from "./BlackCircleGraphic";

export function BlackCircle1x1() {
  return (
    <TileFrame backgroundClassName="bg-[#1A1A1A]" textClassName="text-white">
      <BlackCircleGraphic />
    </TileFrame>
  );
}
