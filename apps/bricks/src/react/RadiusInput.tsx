import { Scan } from "lucide-react";
import { Popover } from "@base-ui/react/popover";

import { Button } from "./button";
import { PopoverContent } from "./popover";
import { NumberInput } from "./NumberInput";

export function RadiusInput(props: {
  value: {
    topLeft: number | null;
    topRight: number | null;
    bottomRight: number | null;
    bottomLeft: number | null;
  };
  onChange: (value: {
    topLeft: number | null;
    topRight: number | null;
    bottomRight: number | null;
    bottomLeft: number | null;
  }) => void;
}) {
  const { value, onChange } = props;
  const { topLeft, topRight, bottomRight, bottomLeft } = value;
  const mixed = topLeft !== topRight || topLeft !== bottomRight || topLeft !== bottomLeft;

  return (
    <Popover.Root>
      <div className="grid grid-cols-[minmax(0,1fr)_28px] items-center gap-1">
        <NumberInput
          inline
          label="Radius"
          value={mixed ? null : topLeft}
          placeholder={mixed ? "Mixed" : undefined}
          min={0}
          leadingIcon={<Scan className="size-3" />}
          onChange={(radius) =>
            onChange({ topLeft: radius, topRight: radius, bottomRight: radius, bottomLeft: radius })
          }
        />
        <Popover.Trigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 rounded-[9px]"
              aria-label="Edit individual corner radii"
            >
              <Scan aria-hidden="true" className="size-3.5" />
            </Button>
          }
        />
      </div>
      <PopoverContent>
        <Popover.Title className="px-4 py-3 leading-5 font-semibold">Radius</Popover.Title>
        <hr className="border-neutral-200" />
        <div className="grid gap-2 p-4">
          {[
            {
              key: "topLeft",
              label: "Top left",
              radius: topLeft,
              mark: "rounded-tl-[5px] border-t border-l",
            },
            {
              key: "topRight",
              label: "Top right",
              radius: topRight,
              mark: "rounded-tr-[5px] border-t border-r",
            },
            {
              key: "bottomRight",
              label: "Bottom right",
              radius: bottomRight,
              mark: "rounded-br-[5px] border-b border-r",
            },
            {
              key: "bottomLeft",
              label: "Bottom left",
              radius: bottomLeft,
              mark: "rounded-bl-[5px] border-b border-l",
            },
          ].map(({ key, label, radius, mark }) => (
            <NumberInput
              key={key}
              inline
              steppers
              label={label}
              min={0}
              value={radius}
              leadingIcon={<span className={`block size-2 ${mark}`} />}
              onChange={(next) => onChange({ ...value, [key]: next })}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover.Root>
  );
}
