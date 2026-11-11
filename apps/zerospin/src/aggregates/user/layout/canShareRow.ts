/** Variable-height content occupies its Row alone. Pixel-width fitting belongs to the browser. */
export function canShareRow(props: {
  incomingVariant: { defaultHeight: number | null };
  existingVariants: readonly { defaultHeight: number | null }[];
}) {
  const { incomingVariant, existingVariants } = props;
  if (existingVariants.length === 0) return true;
  if (incomingVariant.defaultHeight === null) return false;
  return existingVariants.every((variant) => variant.defaultHeight !== null);
}
