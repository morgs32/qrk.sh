import type { ComponentType } from "react";
/** A size within one content variant (no collection scope). */
export type IBrickDef<VARIANT extends string = string, SIZE extends string = string> = {
    w: number;
    h: number;
    /** Kebab-case content variant slug (for example `default`, `profile`, or `repo`). */
    variant: VARIANT;
    /** Kebab-case size slug (for example `2x2`, `4x4`, or `8x2`). */
    size: SIZE;
    /** Display label for this size. */
    label: string;
    /** Lower sorts earlier in the drawer carousel within a collection. */
    order: number;
};
export type ICollection = {
    /** Kebab-case collection id, unique across the homepage catalog. */
    collectionName: string;
    collectionLabel: string;
    collectionDescription: string;
    variants: Record<string, {
        sizes: Record<string, ICollectionBrick>;
    }>;
};
/** Serializable catalog row: collection + content variant + size, no React component. */
export type ICollectionBrickDef = IBrickDef & {
    collectionName: string;
    collectionLabel: string;
};
export type IBrick<VARIANT extends string = string, SIZE extends string = string> = {
    def: IBrickDef<VARIANT, SIZE>;
    component: ComponentType;
};
export type ICollectionBrick = {
    def: ICollectionBrickDef;
    component: ComponentType;
};
//# sourceMappingURL=types.d.ts.map