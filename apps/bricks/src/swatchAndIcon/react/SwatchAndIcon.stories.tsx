import type { Meta, StoryObj } from "@storybook/react-vite";
import { BrickStory } from "../../../.storybook/BrickStory";
import { swatchAndIconV1 } from "../definition/swatchAndIconV1";
import { swatchAndIconView } from "./swatchAndIconView";
import { iconSvgGraphicView } from "./SwatchAndIcon/components/IconSvgGraphic";
import { swatchAndIconColorView } from "./SwatchAndIcon/components/SwatchAndIconColor";

const meta = {
  title: "Modules/Swatch and Icon",
  parameters: { layout: "fullscreen", controls: { disable: true } },
  args: { fixture: "configured" },
  render(props) {
    const { fixture } = props;
    return (
      <BrickStory
        key={fixture}
        definition={swatchAndIconV1}
        view={swatchAndIconView}
        fixture={fixture}
        renderSketch={(state) => (
          <swatchAndIconColorView.Component color={state.payload.color}>
            <iconSvgGraphicView.Component name={state.data.name} svg={state.data.svg} />
          </swatchAndIconColorView.Component>
        )}
      />
    );
  },
} satisfies Meta<{ fixture: "configured" | "unconfigured" }>;

export default meta;

export const Playground: StoryObj<typeof meta> = { name: "Breakpoint Previews" };
