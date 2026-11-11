"use client";

import * as React from "react";
import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group";
import { Toggle } from "@base-ui/react/toggle";
import { type VariantProps } from "class-variance-authority";

import { cn } from "cn";

import { toggleVariants } from "./toggle";

const ToggleGroupContext = React.createContext<VariantProps<typeof toggleVariants>>({
  size: "default",
  variant: "default",
});

function ToggleGroup(
  props: React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive> &
    VariantProps<typeof toggleVariants>,
) {
  const { className, variant, size, children, ...elementProps } = props;
  return (
    <ToggleGroupPrimitive
      data-slot="toggle-group"
      className={(state) =>
        cn(
          "flex items-center justify-center gap-1",
          typeof className === "function" ? className(state) : className,
        )
      }
      {...elementProps}
    >
      <ToggleGroupContext.Provider value={{ variant, size }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive>
  );
}

function ToggleGroupItem(
  props: React.ComponentPropsWithoutRef<typeof Toggle> & VariantProps<typeof toggleVariants>,
) {
  const { className, children, variant, size, ...elementProps } = props;
  const context = React.useContext(ToggleGroupContext);

  return (
    <Toggle
      data-slot="toggle-group-item"
      className={(state) =>
        cn(
          toggleVariants({
            variant: context.variant || variant,
            size: context.size || size,
          }),
          typeof className === "function" ? className(state) : className,
        )
      }
      {...elementProps}
    >
      {children}
    </Toggle>
  );
}

export { ToggleGroup, ToggleGroupItem };
