# Image carousel libraries and accessibility

Researched 2026-11-12 for QRK's ImageCarousel brick. The selected direction is Embla, with image-only slides, creator-adjustable rotation, and QRK-owned controls.

## Options

- **Embla** provides a React hook and leaves slide markup, presentation, and controls to the application. Its optional autoplay plugin is separate. shadcn's Base UI carousel uses Embla, making it a natural fit for QRK's component conventions. [Embla React](https://www.embla-carousel.com/docs/v8/get-started/react), [Embla autoplay](https://www.embla-carousel.com/docs/v8/plugins/autoplay), [shadcn carousel](https://ui.shadcn.com/docs/components/base/carousel).
- **Swiper** supplies React components and opt-in modules for navigation, pagination, keyboard interaction, accessibility, and autoplay, with corresponding styles. It offers more built-in features, but its controls and styling still need integration with QRK's Bricks components. [Swiper React](https://swiperjs.com/react), [Swiper accessibility options](https://swiperjs.com/types/interfaces/modules_a11y_a11y.A11yOptions).
- **CSS scroll snap** supplies native snapping for scroll containers without a carousel dependency. Controls, slide state, accessibility semantics, and automatic looping still need application behavior. [MDN CSS scroll snap](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Scroll_snap), [Chrome carousel guidance](https://developer.chrome.com/docs/modern-web-guidance/guides/ui-components/carousel).

Embla is the chosen tradeoff: it supplies carousel movement while allowing the module to own its visual design and accessible controls. This is a project decision, not a claim that the other options cannot meet the requirements. No comparable bundle-size measurements were established.

## Accessibility requirements

The W3C carousel pattern calls for previous and next controls, an identifiable carousel and slides, and a stop/start control when rotation is automatic. Rotation stops while the pointer hovers and when keyboard focus enters; after focus stops it, it does not restart without explicit user action. Slide selectors are optional. [W3C carousel pattern](https://www.w3.org/WAI/ARIA/apg/patterns/carousel/).

The W3C example starts paused for reduced motion, describes a live region that is polite only while not rotating, and cautions that real browser and assistive-technology testing remains necessary. Controls over images need sufficient contrast. [W3C auto-rotating carousel example](https://www.w3.org/WAI/ARIA/apg/patterns/carousel/examples/carousel-1-prev-next/).

Images need text alternatives appropriate to their purpose; an empty alternative is appropriate for decorative images. [W3C image decision tree](https://www.w3.org/WAI/tutorials/images/decision-tree/).

## QRK fit

The existing Image module provides the closest model for image upload, URL selection, cropping, and rendering. The shared image input handles one image at a time; slide ordering and rotation are new module-owned behavior. The Brick model restricts module IDs, so adding the carousel also requires versioned declaration evolution. Existing registry canonical selections and registrations are user-controlled. [Image form](../../apps/bricks/src/modules/image/react/ImageForm.tsx), [Image input](../../apps/bricks/src/components/ImageUploadInput.tsx), [Brick model](../../apps/zerospin/src/aggregates/user/models/brick/BrickV3.ts), [repository instructions](../../AGENTS.md).
