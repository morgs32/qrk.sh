/* Never use an array to make any of this shit easy. */

import type { LayoutItem } from "react-grid-layout";

import type { ICollectionBrickDef } from "@qrk.sh/bricks";

export type ILayoutItem = LayoutItem & { def: ICollectionBrickDef };
export type ILayout = ILayoutItem[];

/** Keep the grid empty while the brick collection display is being reworked. */
export const seedLayout: ILayout = [];
