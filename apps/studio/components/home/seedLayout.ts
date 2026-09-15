import type { Layout } from "react-grid-layout";

export type ILayout = Layout;

/** Match the four gray 2×2 fixtures in the bricks package workbench. */
export const seedLayout: ILayout = [
  { i: "fixture-1", x: 0, y: 0, w: 2, h: 2 },
  { i: "fixture-2", x: 2, y: 0, w: 2, h: 2 },
  { i: "fixture-3", x: 4, y: 0, w: 2, h: 2 },
  { i: "fixture-4", x: 6, y: 0, w: 2, h: 2 },
];
