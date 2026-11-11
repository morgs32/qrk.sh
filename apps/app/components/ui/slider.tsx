import { Slider as SliderPrimitive } from "@base-ui/react/slider";

// shadcn Base UI Slider with a single thumb and explicit label/help associations.
export function Slider(
  props: SliderPrimitive.Root.Props<number> & {
    thumbLabelledBy: string;
    thumbDescribedBy?: string;
  },
) {
  const { children, thumbLabelledBy, thumbDescribedBy, ...rootProps } = props;
  return (
    <SliderPrimitive.Root data-slot="slider" thumbAlignment="edge" {...rootProps}>
      <SliderPrimitive.Control
        data-slot="slider-control"
        className="relative flex h-7 w-full touch-none items-center select-none data-disabled:opacity-50"
      >
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted"
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className="absolute h-full bg-primary"
          />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          aria-labelledby={thumbLabelledBy}
          aria-describedby={thumbDescribedBy}
          className="block size-4 shrink-0 rounded-full border border-primary bg-background shadow-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </SliderPrimitive.Control>
      {children}
    </SliderPrimitive.Root>
  );
}
