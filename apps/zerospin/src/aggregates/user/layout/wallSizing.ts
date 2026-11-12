export const wallBreakpointWidths = { sm: 360, md: 720, lg: 1080, xl: 1440 };

/** Measure required cell widths without changing the saved arrangement. */
export function measureWallFit(props: {
  layout: {
    sections: readonly {
      id: string;
      stacks: readonly { rows: readonly { placementIds: readonly string[] }[] }[];
    }[];
  };
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

/** Fit a Row to its Stack while preserving each Brick's minimum width. */
export function allocateRowWidths(props: {
  stackWidth: number;
  brickGap: number;
  minimums: readonly number[];
  weights: readonly number[];
}) {
  const { stackWidth, brickGap, minimums, weights } = props;
  const floored = weights.map((weight, index) => Math.max(weight, minimums[index]));
  const gapWidth = Math.max(0, weights.length - 1) * brickGap;
  const minimumWidth = minimums.reduce((sum, width) => sum + width, gapWidth);
  const naturalWidth = floored.reduce((sum, width) => sum + width, gapWidth);
  const contentWidth = Math.min(stackWidth, Math.max(minimumWidth, naturalWidth));
  const proportions = floored;
  const widths = [...minimums];
  let remaining = contentWidth - gapWidth;
  let open = proportions.map((_, index) => index);
  // Reallocate after pinning any Brick that would fall below its minimum.
  while (open.length > 0) {
    const largest = open.reduce((max, index) => Math.max(max, proportions[index]), 0);
    const total = open.reduce((sum, index) => sum + proportions[index] / largest, 0);
    const scale = remaining / total;
    const eligible = open.filter(
      (index) => (proportions[index] / largest) * scale < minimums[index],
    );
    if (eligible.length === 0) {
      for (const index of open) widths[index] = (proportions[index] / largest) * scale;
      break;
    }
    remaining -= eligible.reduce((sum, index) => sum + minimums[index], 0);
    open = open.filter((index) => !eligible.includes(index));
  }
  return { contentWidth, widths };
}
