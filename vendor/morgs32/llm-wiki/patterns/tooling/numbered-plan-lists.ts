/**
 * Use numbered lists in plans so the user can respond by item number.
 *
 * @bad Do not write plan sections with unordered `-` bullets.
 * @bad Do not mix numbered implementation steps with unordered test bullets.
 */
export const numberedPlanMarkdown = `# Example Plan

## Summary
1. State the goal.
2. Name the important constraint.
3. Identify the intended outcome.

## Implementation
1. Update the smallest owning module.
2. Add the required caller wiring.
3. Leave unrelated behavior unchanged.

## Test Plan
1. Run the focused unit test.
2. Run the affected typecheck.
3. Verify the user-facing path manually when needed.
`;
