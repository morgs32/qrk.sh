import { Separator } from "./separator";
import { Popover } from "@base-ui/react/popover";
import type { ReactNode } from "react";

import { PopoverContent } from "./popover";
import { InputGroupButton } from "./input-group";

export function SwatchPopover(props: { label: string; color: string; children: ReactNode }) {
  const { label, color, children } = props;

  return (
    <Popover.Root>
      <Popover.Trigger
        render={
          <InputGroupButton
            size="icon-xs"
            aria-label={`Pick ${label.toLowerCase()} color`}
            className="hover:bg-neutral-200"
          >
            <span
              aria-hidden="true"
              className="size-3 rounded-[2px] bg-white"
              style={{ backgroundColor: color }}
            />
          </InputGroupButton>
        }
      />
      <PopoverContent>
        <Popover.Title className="px-4 py-3 leading-5 font-semibold">{label}</Popover.Title>
        <Separator className="bg-neutral-200" />
        <div className="grid gap-3 p-4">{children}</div>
      </PopoverContent>
    </Popover.Root>
  );
}
