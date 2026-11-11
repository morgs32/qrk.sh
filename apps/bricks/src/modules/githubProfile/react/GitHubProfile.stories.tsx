import type { Meta, StoryObj } from "@storybook/react-vite";
import { BrickStory } from "../../../../.storybook/BrickStory";
import { githubProfileV1 } from "../definition/githubProfileV1";
import { githubProfileView } from "./githubProfileView";
import { BrickBody } from "../../../components/BrickBody";
import { BrickFooter } from "../../../components/BrickFooter";
import { BrickShell } from "../../../components/BrickShell";
import { Column } from "../../../components/Column";
import { Row } from "../../../components/Row";
import { avatarAndUsernameView } from "./GitHubProfile/components/AvatarAndUsername";
import { bioView } from "./GitHubProfile/components/Bio";
import { blogView } from "./GitHubProfile/components/Blog";
import { followersView } from "./GitHubProfile/components/Followers";
import { followingView } from "./GitHubProfile/components/Following";
import { locationView } from "./GitHubProfile/components/Location";
import { publicReposView } from "./GitHubProfile/components/PublicRepos";

const meta = {
  title: "Modules/GitHub Profile",
  parameters: { layout: "fullscreen", controls: { disable: true } },
  args: { fixture: "configured" },
  render(props) {
    const { fixture } = props;
    return (
      <BrickStory
        key={fixture}
        definition={githubProfileV1}
        view={githubProfileView}
        fixture={fixture}
        renderSketch={(state) => {
          const { data } = state;
          if (data === null) return null;
          return (
            <BrickShell className="bg-white">
              <BrickBody>
                <Column gap={2}>
                  <avatarAndUsernameView.Component
                    avatar_url={data.avatar_url}
                    login={data.login}
                  />
                  <bioView.Component bio={data.bio} />
                  <locationView.Component location={data.location} />
                  <blogView.Component blog={data.blog} />
                </Column>
              </BrickBody>
              <BrickFooter>
                <Row className="w-full" gap={2} justifyContent="flex-end">
                  <followersView.Component followers={data.followers} />
                  <followingView.Component following={data.following} />
                  <publicReposView.Component public_repos={data.public_repos} />
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
