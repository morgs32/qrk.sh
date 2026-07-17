import type { ComponentType } from "react";
/** Variant-only fields (no collection scope). */
export type IBrickDef = {
    w: number;
    h: number;
    /**
     * Kebab-case slug for this variant (e.g. `2x2`, `8x2`) **within its collection**.
     * Must be **unique among bricks in the same `collectionName`**; with a globally unique
     * `collectionName`, **`(collectionName, name)`** uniquely identifies a catalog variant.
     */
    name: string;
    /** Display label for this variant; collection merges default from `collectionLabel` when omitted. */
    label: string;
    /** Lower sorts earlier in the drawer carousel. */
    order: number;
};
export type ICollection<BRICKS extends Record<string, IBrick> = Record<string, IBrick>> = {
    /**
     * Kebab-case collection id; **unique across the homepage catalog** so every
     * **`(collectionName, brick def name)`** pair is unique for a variant.
     */
    collectionName: string;
    collectionLabel: string;
    bricks: {
        [K in keyof BRICKS]: ICollectionBrick<BRICKS[K]>;
    };
};
/** Serializable catalog row: collection + variant, no React component. */
export type ICollectionBrickDef<BRICK_DEF extends IBrickDef = IBrickDef> = BRICK_DEF & {
    collectionName: string;
    collectionLabel: string;
    /** Resolved label after collection merge (always set on catalog bricks). */
    label: string;
};
export type IBrick = {
    def: IBrickDef;
    component: ComponentType;
};
export type ICollectionBrick<BRICK extends IBrick = IBrick> = {
    def: ICollectionBrickDef<BRICK["def"]>;
    component: BRICK["component"];
};
//# sourceMappingURL=types.d.ts.map