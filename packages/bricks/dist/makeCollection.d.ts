import type { ICollection, IBrick } from "./types";
export declare function makeCollection<const T extends Record<string, IBrick>>(props: {
    collectionName: string;
    collectionLabel: string;
    bricks: T;
}): ICollection<T>;
//# sourceMappingURL=makeCollection.d.ts.map