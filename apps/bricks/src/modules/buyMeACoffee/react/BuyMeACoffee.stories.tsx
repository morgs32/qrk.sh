import type { Meta, StoryObj } from "@storybook/react-vite";

import { BrickStory } from "../../../../.storybook/BrickStory";
import { BrickShell } from "../../../components/BrickShell";
import { buyMeACoffeeV1 } from "../definition/buyMeACoffeeV1";
import { buyMeACoffeeCardView } from "./BuyMeACoffeeCard";
import { buyMeACoffeeView } from "./buyMeACoffeeView";
import illustrationUrl from "./story-illustration.svg?url";

const meta = {
  title: "Modules/Buy Me a Coffee",
  parameters: { layout: "fullscreen", controls: { disable: true } },
  args: { fixture: "configured" },
  render(props) {
    const { fixture } = props;
    return (
      <BrickStory
        key={fixture}
        illustrationUrl={illustrationUrl}
        definition={buyMeACoffeeV1}
        view={buyMeACoffeeView}
        fixture={fixture}
        renderSketch={(state) => (
          <BrickShell>
            <buyMeACoffeeCardView.Component {...state.payload} />
          </BrickShell>
        )}
      />
    );
  },
} satisfies Meta<{ fixture: "configured" | "unconfigured" }>;

export default meta;

export const Playground: StoryObj<typeof meta> = { name: "Breakpoint Previews" };
export const Unconfigured: StoryObj<typeof meta> = { args: { fixture: "unconfigured" } };
