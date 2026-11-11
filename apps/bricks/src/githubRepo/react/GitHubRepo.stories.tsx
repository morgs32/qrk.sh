import type { Meta, StoryObj } from "@storybook/react-vite";
import { BrickStory } from "../../../.storybook/BrickStory";
import { githubRepoV1 } from "../definition/githubRepoV1";
import { githubRepoView } from "./githubRepoView";
import { BrickBody } from "../../react/BrickBody";
import { BrickFooter } from "../../react/BrickFooter";
import { BrickShell } from "../../react/BrickShell";
import { Row } from "../../react/Row";
import { repoNameView } from "./GitHubRepo/components/RepoName";
import { repoDescriptionView } from "./GitHubRepo/components/RepoDescription";
import { repoStarsView } from "./GitHubRepo/components/RepoStars";
import { repoForksView } from "./GitHubRepo/components/RepoForks";
import { repoLanguageView } from "./GitHubRepo/components/RepoLanguage";

const meta = {
  title: "Modules/GitHub Repo",
  parameters: { layout: "fullscreen", controls: { disable: true } },
  args: { fixture: "configured" },
  render(props) {
    const { fixture } = props;
    return (
      <BrickStory
        key={fixture}
        definition={githubRepoV1}
        view={githubRepoView}
        fixture={fixture}
        renderSketch={(state) => {
          const { data } = state;
          if (data === null) return null;
          return (
            <BrickShell className="bg-white">
              <BrickBody>
                <repoNameView.Component name={data.name} />
                <repoDescriptionView.Component description={data.description} />
              </BrickBody>
              <BrickFooter>
                <Row className="w-full" gap={4}>
                  <repoStarsView.Component stargazers_count={data.stargazers_count} />
                  <repoForksView.Component forks_count={data.forks_count} />
                  <repoLanguageView.Component language={data.language} />
                </Row>
              </BrickFooter>
            </BrickShell>
          );
        }}
      />
    );
  },
} satisfies Meta<{ fixture: "configured" | "unconfigured" }>;

export default meta;

export const Playground: StoryObj<typeof meta> = { name: "Breakpoint Previews" };
export const Unconfigured: StoryObj<typeof meta> = { args: { fixture: "unconfigured" } };
