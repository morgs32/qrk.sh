import { TileFrame } from "../../TileFrame";
import { CreamBenchGraphic } from "./CreamBenchGraphic";

export function CreamBench4x1() {
  return (
    <TileFrame backgroundClassName="bg-[#F5F0E6]" textClassName="text-foreground">
      <CreamBenchGraphic />
    </TileFrame>
  );
}
