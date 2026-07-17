import type { ComponentType } from "react";
import type { IBrick } from "./types";
export declare function makeBrick<N extends string>(props: {
    name: N;
    w: number;
    h: number;
    order: number;
    label: string;
    component: ComponentType;
}): IBrick;
//# sourceMappingURL=makeBrick.d.ts.map