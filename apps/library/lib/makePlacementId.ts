/** Stable placement identity for one Brick at one Wall breakpoint. */
export function makePlacementId(
  brickId: string,
  breakpoint: "sm" | "md" | "lg" | "xl",
): `plc_${string}` {
  return `plc_${brickId}_${breakpoint}`;
}
