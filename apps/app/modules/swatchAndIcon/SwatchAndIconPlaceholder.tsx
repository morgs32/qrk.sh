import { CircleQuestionMark } from "lucide-react";
import { swatchAndIconV1 } from "@qrk.sh/zerospin/src/modules/swatchAndIcon/swatchAndIconV1";

export function SwatchAndIconPlaceholder() {
  return (
    <div
      aria-hidden="true"
      data-swatch-and-icon-placeholder
      className="flex w-full items-center justify-center bg-zinc-500 p-4 text-white"
      style={{ height: swatchAndIconV1.variants.default.defaultHeight ?? "auto" }}
    >
      <CircleQuestionMark className="size-10 shrink-0" />
    </div>
  );
}
