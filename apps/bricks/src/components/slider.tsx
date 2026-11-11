import { Slider as SliderPrimitive } from "@base-ui/react/slider";

// The shadcn Base UI slider structure for a single named Brick editor thumb.
export function Slider(props: SliderPrimitive.Root.Props<number> & { thumbLabelledBy: string }) {
  const { thumbLabelledBy, ...rootProps } = props;
  return (
    <SliderPrimitive.Root data-slot="slider" thumbAlignment="center" {...rootProps}>
      <SliderPrimitive.Control
        data-slot="slider-control"
        className="relative flex h-7 w-full touch-none items-center select-none"
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
          className="block size-3.5 shrink-0 rounded-full border border-primary bg-background shadow-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
        />
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}
