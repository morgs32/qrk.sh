import type { ComponentType } from "react";
import type { IBrick } from "./types";
export declare function makeBrick<const VARIANT extends string, const SIZE extends string>(props: {
    variant: VARIANT;
    size: SIZE;
    w: number;
    h: number;
    order: number;
    label: string;
    component: ComponentType;
}): IBrick<VARIANT, SIZE>;
//# sourceMappingURL=makeBrick.d.ts.map