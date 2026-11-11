import type { Meta, StoryObj } from "@storybook/react-vite";
import { BrickBreakpointPreviews } from "../../.storybook/BrickBreakpointPreviews";
import { mapCanvasView } from "./MapCanvas";

const meta = {
  title: "Modules/Map Place",
  parameters: { layout: "fullscreen", controls: { disable: true } },
  args: { fixture: "configured" },
  render(props) {
    const { fixture } = props;
    return (
      <BrickBreakpointPreviews
        key={fixture}
        moduleId="map-place"
        fixture={fixture}
        renderSketch={(state) => {
          const { data } = state;
          if (data === null) return null;
          return (
            <mapCanvasView.Component
              googlePlaceId={data.googlePlaceId}
              latitude={data.latitude}
              longitude={data.longitude}
              name={data.name}
            />
          );
        }}
      />
    );
  },
} satisfies Meta<{ fixture: "configured" | "unconfigured" }>;

export default meta;

export const Playground: StoryObj<typeof meta> = { name: "Breakpoint Previews" };
export const Unconfigured: StoryObj<typeof meta> = { args: { fixture: "unconfigured" } };
