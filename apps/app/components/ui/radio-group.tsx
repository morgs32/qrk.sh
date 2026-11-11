"use client";

import * as React from "react";
import { Circle } from "lucide-react";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";
import { Radio } from "@base-ui/react/radio";

import { cn } from "cn";

function RadioGroup(props: React.ComponentProps<typeof RadioGroupPrimitive>) {
  const { className, ...elementProps } = props;
  return (
    <RadioGroupPrimitive
      data-slot="radio-group"
      className={(state) =>
        cn("grid gap-2", typeof className === "function" ? className(state) : className)
      }
      {...elementProps}
    />
  );
}

function RadioGroupItem(props: React.ComponentProps<typeof Radio.Root>) {
  const { className, ...elementProps } = props;
  return (
    <Radio.Root
      data-slot="radio-group-item"
      className={(state) =>
        cn(
          "aspect-square size-4 shrink-0 cursor-pointer rounded-full border border-input text-primary shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-input dark:bg-input/30",
          typeof className === "function" ? className(state) : className,
        )
      }
      {...elementProps}
    >
      <Radio.Indicator className="flex items-center justify-center">
        <Circle className="size-2 fill-current" />
      </Radio.Indicator>
    </Radio.Root>
  );
}

export { RadioGroup, RadioGroupItem };
