import type { ICollection, IBrick } from "./types";
export declare function makeCollection(props: {
    collectionName: string;
    collectionLabel: string;
    collectionDescription: string;
    variants: Record<string, {
        sizes: Record<string, IBrick>;
    }>;
}): ICollection;
//# sourceMappingURL=makeCollection.d.ts.map