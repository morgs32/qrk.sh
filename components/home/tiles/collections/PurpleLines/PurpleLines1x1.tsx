import { TileFrame } from "../../TileFrame";
import { PurpleLinesGraphic } from "./PurpleLinesGraphic";

export function PurpleLines1x1() {
  return (
    <TileFrame backgroundClassName="bg-[#8B7BB5]" textClassName="text-black">
      <PurpleLinesGraphic />
    </TileFrame>
  );
}
