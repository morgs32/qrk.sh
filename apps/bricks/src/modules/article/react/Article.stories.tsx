import type { Meta, StoryObj } from "@storybook/react-vite";
import { BrickStory } from "../../../../.storybook/BrickStory";
import { articleV1 } from "../definition/articleV1";
import { articleView } from "./articleView";
import { articleBrickContentView } from "./ArticleBrickContent";
import illustrationUrl from "./story-illustration.svg?url";

const meta = {
  title: "Modules/Article",
  parameters: { layout: "fullscreen", controls: { disable: true } },
  args: { fixture: "configured" },
  render(props) {
    const { fixture } = props;
    return (
      <BrickStory
        illustrationUrl={illustrationUrl}
        key={fixture}
        definition={articleV1}
        view={articleView}
        fixture={fixture}
        renderSketch={(state) => {
          return (
            <articleBrickContentView.Component
              title={state.title}
              subtitle={state.subtitle}
              content={state.content}
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
