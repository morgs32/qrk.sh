import type { wallLayoutSchemaV2 } from "./wallLayoutSchemaV2";

export const wallBreakpointWidths = { sm: 360, md: 720, lg: 1080, xl: 1440 };

/** Measure required cell widths without changing the saved arrangement. */
export function measureWallFit(props: {
  layout: typeof wallLayoutSchemaV2.Type;
  placementMinimumWidths: ReadonlyMap<string, number>;
  wallWidth: number;
  brickGap: number;
}) {
  const { layout, placementMinimumWidths, wallWidth, brickGap } = props;
  return layout.sections.map((section) => {
    const stackMinimums = section.stacks.map((stack) =>
      Math.max(
        160 + brickGap,
        ...stack.rows.map((row) =>
          row.placementIds.reduce((total, placementId) => {
            const minimum = placementMinimumWidths.get(placementId);
            if (minimum === undefined)
              throw new Error(`Wall layout references missing Placement ${placementId}`);
            return total + minimum + brickGap;
          }, 0),
        ),
      ),
    );
    const requiredWidth = stackMinimums.reduce((total, minimum) => total + minimum, 0);
    return {
      sectionId: section.id,
      stackMinimums,
      requiredWidth,
      fits: requiredWidth <= wallWidth + brickGap,
    };
  });
}

/** Share free space equally, fixing constrained Stacks at their minimums. */
export function allocateStackWidths(props: {
  minimumWidths: readonly number[];
  availableWidth: number;
}) {
  const { minimumWidths, availableWidth } = props;
  if (minimumWidths.reduce((total, minimum) => total + minimum, 0) > availableWidth)
    throw new Error("The Section's Stacks cannot fit their available width");
  const widths = minimumWidths.map(() => 0);
  const pending = new Set(minimumWidths.map((_, index) => index));
  let remaining = availableWidth;
  while (pending.size > 0) {
    const equalWidth = remaining / pending.size;
    const constrained = [...pending].filter((index) => minimumWidths[index] > equalWidth);
    if (constrained.length === 0) {
      for (const index of pending) widths[index] = equalWidth;
      break;
    }
    for (const index of constrained) {
      widths[index] = minimumWidths[index];
      remaining -= minimumWidths[index];
      pending.delete(index);
    }
  }
  return widths;
}
