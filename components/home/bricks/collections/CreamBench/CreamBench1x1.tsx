import { BrickFrame } from "../../BrickFrame";
import { CreamBenchGraphic } from "./CreamBenchGraphic";

export function CreamBench1x1() {
  return (
    <BrickFrame backgroundClassName="bg-[#F5F0E6]" textClassName="text-foreground">
      <CreamBenchGraphic />
    </BrickFrame>
  );
}
