# shadcn form layout for brick detail

Researched 2026-10-12 against official shadcn/ui documentation and source. Scope: vertically stacked Image fields and Save/Cancel alignment in Studio's brick drawer.

## Official layout examples

The Field documentation recommends `FieldGroup` for related fields. Default vertical orientation stacks the label and control; horizontal orientation places children in a row. This fits stacked Image URL/Title fields followed by a horizontal action row. [Field documentation](https://ui.shadcn.com/docs/components/radix/field#responsive-layout).

The official payment form places the entire form inside `w-full max-w-md`. Its inputs and final Submit/Cancel row share the outer `FieldGroup`; the action row uses `Field orientation="horizontal"`, with a submit button and an outline secondary button. Width is constrained once around both fields and actions. [Field demo source](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/examples/field-demo.tsx).

`FieldGroup` fills its parent width and stacks children. `Field` also fills its parent; its vertical variant gives children full width. The horizontal variant uses a flex row without end justification, so buttons start at the same left edge as the fields. [Field implementation](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/field.tsx).

## Recommendation for QRK

Apply width, horizontal placement, and padding to the existing Studio form container enclosing both the Library Form and Save/Cancel row. Keep Library's Image field stack full width within that container, with no independent centering or narrower width. Place the actions directly below the field stack, aligned to its left edge.

This ownership recommendation is an inference from the shared-container pattern in the [official demo](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/examples/field-demo.tsx), applied to QRK's existing split between module-owned fields and Studio-owned actions. shadcn does not prescribe that application/module boundary.

Reuse the existing shadcn Input and Button components, semantic field labels, and explicit layout classes for this targeted correction. Installing Field or changing the form library is unnecessary to achieve the demonstrated geometry; that is a scope recommendation, not an upstream requirement.
