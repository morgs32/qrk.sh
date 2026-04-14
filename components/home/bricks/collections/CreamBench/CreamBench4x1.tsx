import { BrickFrame } from "../../BrickFrame";
import { CreamBenchGraphic } from "./CreamBenchGraphic";

export function CreamBench4x1() {
  return (
    <BrickFrame backgroundClassName="bg-[#F5F0E6]" textClassName="text-foreground">
      <CreamBenchGraphic />
    </BrickFrame>
  );
}
