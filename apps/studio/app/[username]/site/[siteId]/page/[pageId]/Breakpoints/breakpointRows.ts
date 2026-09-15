import type { LucideIcon } from "lucide-react";
import { Laptop, Monitor, Smartphone } from "lucide-react";

export const BREAKPOINT_ROWS = [
  {
    prefix: "sm",
    minWidth: "640px",
    typicalDevice: "large phones / small tablets",
    Icon: Smartphone,
  },
  { prefix: "lg", minWidth: "1024px", typicalDevice: "small laptops", Icon: Laptop },
  { prefix: "xl", minWidth: "1280px", typicalDevice: "desktops", Icon: Monitor },
] as const satisfies {
  prefix: string;
  minWidth: string;
  typicalDevice: string;
  Icon?: LucideIcon;
}[];

export type BreakpointPrefix = (typeof BREAKPOINT_ROWS)[number]["prefix"];
