import { makeModuleView } from "../../make/makeModuleView";
import { registry } from "./generator/GitHubRepoJsonRenderRegistry";
import { defaultSpec } from "./generator/defaultSpec";
import { githubRepoV1 } from "./githubRepoV1";
import { BrickBody } from "../../components/brick/BrickBody";
import { BrickFooter } from "../../components/brick/BrickFooter";
import { BrickShell } from "../../components/brick/BrickShell";
import { Row } from "../../components/Row";
import { repoNameView } from "./GitHubRepo/components/RepoName";
import { repoDescriptionView } from "./GitHubRepo/components/RepoDescription";
import { repoStarsView } from "./GitHubRepo/components/RepoStars";
import { repoForksView } from "./GitHubRepo/components/RepoForks";
import { repoLanguageView } from "./GitHubRepo/components/RepoLanguage";

export const githubRepoView = makeModuleView(githubRepoV1, {
  default: {
    component(props) {
      const { state } = props;
      return (
        <BrickShell className="bg-white">
          <BrickBody>
            <repoNameView.Component name={state.data.name} />
            <repoDescriptionView.Component description={state.data.description} />
          </BrickBody>
          <BrickFooter>
            <Row className="w-full" gap={4}>
              <repoStarsView.Component stargazers_count={state.data.stargazers_count} />
              <repoForksView.Component forks_count={state.data.forks_count} />
              <repoLanguageView.Component language={state.data.language} />
            </Row>
          </BrickFooter>
        </BrickShell>
      );
    },
    generator: { registry, defaultSpec },
  },
});
