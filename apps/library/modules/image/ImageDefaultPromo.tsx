import { Image } from "@unpic/react";

import { BrickFrame } from "../../BrickFrame";

import { DEFAULT_IMAGE_SRC } from "./ImageOptionsForm";

export function ImageDefaultPromo(props: {
  breakpoint: "xs" | "sm" | "lg" | "xl";
  options?: unknown;
}) {
  const src =
    props.options !== null &&
    typeof props.options === "object" &&
    "src" in props.options &&
    typeof props.options.src === "string" &&
    props.options.src.length > 0
      ? props.options.src
      : DEFAULT_IMAGE_SRC;

  return (
    <BrickFrame backgroundClassName="bg-neutral-100" textClassName="text-black">
      <div className="relative h-full w-full min-h-0 overflow-hidden rounded-lg shadow-lg">
        <Image
          src={src}
          alt="White Bay Power Station - Historic industrial brick building with Sydney skyline in background"
          className="absolute inset-0 h-full w-full object-cover"
          layout="fullWidth"
          height={800}
          sizes="(max-width: 768px) 100vw, 50vw"
        />
        <div className="absolute bottom-0 left-0 right-0 bg-white px-4 py-3">
          <h2 className="text-2xl font-semibold leading-tight text-black">
            White Bay
            <br />
            Power Station
          </h2>
        </div>
      </div>
    </BrickFrame>
  );
}
