import type { ComponentPropsWithoutRef, CSSProperties, ReactNode } from "react";
import { cn } from "cn";

export function Row(
  props: {
    children?: ReactNode;
    className?: string;
    gap: 2 | 4;
    justifyContent?: CSSProperties["justifyContent"];
    alignItems?: CSSProperties["alignItems"];
    flexWrap?: CSSProperties["flexWrap"];
    style?: CSSProperties;
  } & Omit<ComponentPropsWithoutRef<"div">, "children" | "className" | "style">,
) {
  const { children, className, gap, justifyContent, alignItems, flexWrap, style, ...divProps } =
    props;
  return (
    <div
      {...divProps}
      className={cn("flex min-w-0 flex-row", gap === 2 ? "gap-2" : "gap-4", className)}
      style={{
        justifyContent,
        alignItems,
        flexWrap,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
