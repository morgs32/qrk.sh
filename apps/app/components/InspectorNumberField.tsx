import { NumberField } from "@base-ui/react/number-field";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";

export function InspectorNumberField(props: {
  id: string;
  label: string;
  leadingIcon?: ReactNode;
  selectOnFocus?: boolean;
  value?: number | null;
  onValueChange?: (value: number | null) => void;
}) {
  const { id, label, leadingIcon, selectOnFocus, value, onValueChange } = props;
  const stepperButton = "h-[13px] w-6 rounded-sm text-neutral-600 hover:bg-neutral-200";

  return (
    <NumberField.Root
      id={id}
      min={0}
      allowWheelScrub={false}
      value={value}
      onValueChange={onValueChange}
    >
      <NumberField.Group
        render={
          <InputGroup className="h-7 rounded-[9px] border-transparent bg-neutral-100 shadow-none" />
        }
      >
        {leadingIcon ? <InputGroupAddon className="pl-2">{leadingIcon}</InputGroupAddon> : null}
        <NumberField.Input
          render={<InputGroupInput className="h-7 px-2 py-0 text-xs leading-4 md:text-xs" />}
          aria-label={label}
          onFocus={selectOnFocus ? (event) => event.currentTarget.select() : undefined}
        />
        <InputGroupAddon align="inline-end" className="grid gap-0 py-0 pr-1">
          <NumberField.Increment
            render={<Button variant="ghost" size="icon" />}
            aria-label={`Increase ${label.toLowerCase()}`}
            className={stepperButton}
          >
            <ChevronUp aria-hidden="true" className="size-3" />
          </NumberField.Increment>
          <NumberField.Decrement
            render={<Button variant="ghost" size="icon" />}
            aria-label={`Decrease ${label.toLowerCase()}`}
            className={stepperButton}
          >
            <ChevronDown aria-hidden="true" className="size-3" />
          </NumberField.Decrement>
        </InputGroupAddon>
      </NumberField.Group>
    </NumberField.Root>
  );
}
