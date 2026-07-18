import type { IBrick } from "./types";
export declare function makeVariant<const VARIANT extends string, const SIZES extends Record<string, IBrick<VARIANT, string>>>(props: {
    variant: VARIANT;
    sizes: SIZES & {
        [SIZE in keyof SIZES]: SIZES[SIZE] & {
            def: {
                variant: VARIANT;
                size: SIZE & string;
            };
        };
    };
}): {
    sizes: SIZES & { [SIZE in keyof SIZES]: SIZES[SIZE] & {
        def: {
            variant: VARIANT;
            size: SIZE & string;
        };
    }; };
};
//# sourceMappingURL=makeVariant.d.ts.map