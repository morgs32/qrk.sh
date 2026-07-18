import type { IBrick } from "./types";

export function makeVariant<
  const VARIANT extends string,
  const SIZES extends Record<string, IBrick<VARIANT, string>>,
>(props: {
  variant: VARIANT;
  variantDescription: string;
  sizes: SIZES & {
    [SIZE in keyof SIZES]: SIZES[SIZE] & {
      def: {
        variant: VARIANT;
        size: SIZE & string;
      };
    };
  };
}) {
  return {
    variantDescription: props.variantDescription,
    sizes: props.sizes,
  };
}
