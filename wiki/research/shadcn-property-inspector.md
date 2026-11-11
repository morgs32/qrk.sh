# shadcn property inspector

Researched 2026-11-10 for the compact Styles and Transforms sidebar with a four-corner radius popover in the Storybook reference.

## Closest match

`@shadcn/designer` is shadcn's design-editor toolkit. Its right-panel example uses the same **Styles** and **Transforms** headings and includes controls for radius, border, shadow, fill, and rotation. `ActionCorner` supports both grouped radius editing and independent corners. The guide also includes `ActionDirection` under Transforms, while the action reference describes it as flex direction. The docs establish the panel structure and radius behavior. The exact popup geometry and flip controls remain unverified. [Installation example](https://ds.shadcn.com/docs/guides/installation#more-actions), [action reference](https://ds.shadcn.com/docs/reference/actions), [corner controls changelog](https://ds.shadcn.com/docs/changelog#shared-border-corner-and-padding-controls).

The built-in actions edit selected Designer layers. The documented installation uses a licensed package from shadcn's private registry and requires Designer CSS. The package therefore fits an editor that adopts its layer model. The public example is enough to reference for the Storybook sidebar. [Designer concepts](https://ds.shadcn.com/docs/concepts/designer), [installation requirements](https://ds.shadcn.com/docs/guides/installation#install-package), [pricing and license access](https://ds.shadcn.com/docs/pricing).

## Other references

- **Puck** provides an open-source React visual editor with a fields panel for the selected component. It supports custom fields and UI overrides, so the reference's shadcn radius and transform controls would be authored in the integration. [Puck introduction](https://puckeditor.com/docs), [fields plugin](https://puckeditor.com/docs/extending-puck/plugins#core-plugins), [custom fields](https://puckeditor.com/docs/extending-puck/custom-fields).
- **Webstudio** has a right-side Style Panel with border radius, backgrounds, box shadows, and transforms. Its controls apply to the selected instance and respect the builder's style sources and breakpoints. It is a useful interaction reference for CSS styling. [Webstudio Style Panel](https://docs.webstudio.is/university/foundations/style-panel).

## Recommendation for Storybook

Compose the two compact sections with QRK's existing shadcn controls. Use labeled inputs for numeric values, small icon buttons for the adjacent actions, a separator between sections, and a popover anchored to the radius button for independent corner values. shadcn documents the same popover composition with a button trigger and form fields inside. [shadcn Popover](https://ui.shadcn.com/docs/components/radix/popover#with-form), [QRK Button](../../apps/app/components/ui/button.tsx), [QRK Input](../../apps/app/components/ui/input.tsx), [QRK Popover](../../apps/app/components/ui/popover.tsx), [QRK Separator](../../apps/app/components/ui/separator.tsx).
