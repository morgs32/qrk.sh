import type { LucideIcon } from "lucide-react";
import { Laptop, Monitor, Smartphone, Tablet } from "lucide-react";

export const BREAKPOINT_ROWS = [
  {
    prefix: "sm",
    minWidth: "640px",
    typicalDevice: "large phones / small tablets",
    Icon: Smartphone,
  },
  { prefix: "md", minWidth: "768px", typicalDevice: "tablets", Icon: Tablet },
  { prefix: "lg", minWidth: "1024px", typicalDevice: "small laptops", Icon: Laptop },
  { prefix: "xl", minWidth: "1280px", typicalDevice: "desktops", Icon: Monitor },
  { prefix: "2xl", minWidth: "1536px", typicalDevice: "large screens", Icon: Monitor },
] as const satisfies {
  prefix: string;
  minWidth: string;
  typicalDevice: string;
  Icon?: LucideIcon;
}[];

export type BreakpointPrefix = (typeof BREAKPOINT_ROWS)[number]["prefix"];
