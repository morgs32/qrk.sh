import type { ReactNode } from "react";
import { cn } from "cn";

const sizeClassByBreakpoint = {
  initial: {
    xs: "text-xs",
    sm: "text-sm",
    base: "text-base",
    lg: "text-lg",
    xl: "text-xl",
    "2xl": "text-2xl",
    "3xl": "text-3xl",
    "4xl": "text-4xl",
    "5xl": "text-5xl",
  },
  md: {
    xs: "@md:text-xs",
    sm: "@md:text-sm",
    base: "@md:text-base",
    lg: "@md:text-lg",
    xl: "@md:text-xl",
    "2xl": "@md:text-2xl",
    "3xl": "@md:text-3xl",
    "4xl": "@md:text-4xl",
    "5xl": "@md:text-5xl",
  },
  lg: {
    xs: "@lg:text-xs",
    sm: "@lg:text-sm",
    base: "@lg:text-base",
    lg: "@lg:text-lg",
    xl: "@lg:text-xl",
    "2xl": "@lg:text-2xl",
    "3xl": "@lg:text-3xl",
    "4xl": "@lg:text-4xl",
    "5xl": "@lg:text-5xl",
  },
  xl: {
    xs: "@xl:text-xs",
    sm: "@xl:text-sm",
    base: "@xl:text-base",
    lg: "@xl:text-lg",
    xl: "@xl:text-xl",
    "2xl": "@xl:text-2xl",
    "3xl": "@xl:text-3xl",
    "4xl": "@xl:text-4xl",
    "5xl": "@xl:text-5xl",
  },
} as const;

const alignClassByBreakpoint = {
  initial: {
    left: "text-left",
    center: "text-center",
    right: "text-right",
  },
  md: {
    left: "@md:text-left",
    center: "@md:text-center",
    right: "@md:text-right",
  },
  lg: {
    left: "@lg:text-left",
    center: "@lg:text-center",
    right: "@lg:text-right",
  },
  xl: {
    left: "@xl:text-left",
    center: "@xl:text-center",
    right: "@xl:text-right",
  },
} as const;

const wrapClassByBreakpoint = {
  initial: {
    wrap: "text-wrap",
    nowrap: "text-nowrap",
    pretty: "text-pretty",
    balance: "text-balance",
    truncate: "truncate",
  },
  md: {
    wrap: "@md:text-wrap",
    nowrap: "@md:text-nowrap",
    pretty: "@md:text-pretty",
    balance: "@md:text-balance",
    truncate: "@md:truncate",
  },
  lg: {
    wrap: "@lg:text-wrap",
    nowrap: "@lg:text-nowrap",
    pretty: "@lg:text-pretty",
    balance: "@lg:text-balance",
    truncate: "@lg:truncate",
  },
  xl: {
    wrap: "@xl:text-wrap",
    nowrap: "@xl:text-nowrap",
    pretty: "@xl:text-pretty",
    balance: "@xl:text-balance",
    truncate: "@xl:truncate",
  },
} as const;

const trimClassByBreakpoint = {
  initial: {
    normal: "",
    start: "text-box-trim-start text-box-edge-cap-alphabetic",
    end: "text-box-trim-end text-box-edge-cap-alphabetic",
    both: "text-box-trim-both text-box-edge-cap-alphabetic",
  },
  md: {
    normal: "",
    start: "@md:text-box-trim-start @md:text-box-edge-cap-alphabetic",
    end: "@md:text-box-trim-end @md:text-box-edge-cap-alphabetic",
    both: "@md:text-box-trim-both @md:text-box-edge-cap-alphabetic",
  },
  lg: {
    normal: "",
    start: "@lg:text-box-trim-start @lg:text-box-edge-cap-alphabetic",
    end: "@lg:text-box-trim-end @lg:text-box-edge-cap-alphabetic",
    both: "@lg:text-box-trim-both @lg:text-box-edge-cap-alphabetic",
  },
  xl: {
    normal: "",
    start: "@xl:text-box-trim-start @xl:text-box-edge-cap-alphabetic",
    end: "@xl:text-box-trim-end @xl:text-box-edge-cap-alphabetic",
    both: "@xl:text-box-trim-both @xl:text-box-edge-cap-alphabetic",
  },
} as const;

type TextSize = keyof (typeof sizeClassByBreakpoint)["initial"];
type TextAlign = keyof (typeof alignClassByBreakpoint)["initial"];
type TextWrap = keyof (typeof wrapClassByBreakpoint)["initial"];
type TextTrim = keyof (typeof trimClassByBreakpoint)["initial"];

type ResponsiveValue<T extends string> =
  | T
  | {
      initial?: T;
      md?: T;
      lg?: T;
      xl?: T;
    };

function responsiveClasses<T extends string>(
  value: ResponsiveValue<T> | undefined,
  map: {
    initial: Record<T, string>;
    md: Record<T, string>;
    lg: Record<T, string>;
    xl: Record<T, string>;
  },
): string {
  if (value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return map.initial[value];
  }

  return cn(
    value.initial !== undefined ? map.initial[value.initial] : undefined,
    value.md !== undefined ? map.md[value.md] : undefined,
    value.lg !== undefined ? map.lg[value.lg] : undefined,
    value.xl !== undefined ? map.xl[value.xl] : undefined,
  );
}

export function Text(props: {
  as?: "span" | "div" | "label" | "p";
  size?: ResponsiveValue<TextSize>;
  align?: ResponsiveValue<TextAlign>;
  wrap?: ResponsiveValue<TextWrap>;
  trim?: ResponsiveValue<TextTrim>;
  className?: string;
  children?: ReactNode;
}) {
  const Tag = props.as ?? "span";

  return (
    <Tag
      className={cn(
        responsiveClasses(props.size, sizeClassByBreakpoint),
        responsiveClasses(props.align, alignClassByBreakpoint),
        responsiveClasses(props.wrap, wrapClassByBreakpoint),
        responsiveClasses(props.trim, trimClassByBreakpoint),
        props.className,
      )}
    >
      {props.children}
    </Tag>
  );
}
