import { makeModuleView } from "../../make/makeModuleView";
import { registry } from "./generator/GitHubRepoJsonRenderRegistry";
import { githubRepoV1 } from "./githubRepoV1";
import { GitHubRepoForm } from "./GitHubRepoForm";
import { BrickBody } from "../../components/brick/BrickBody";
import { BrickFooter } from "../../components/brick/BrickFooter";
import { BrickShell } from "../../components/brick/BrickShell";
import { Row } from "../../components/Row";
import { repoNameView } from "./GitHubRepo/components/RepoName";
import { repoDescriptionView } from "./GitHubRepo/components/RepoDescription";
import { repoStarsView } from "./GitHubRepo/components/RepoStars";
import { repoForksView } from "./GitHubRepo/components/RepoForks";
import { repoLanguageView } from "./GitHubRepo/components/RepoLanguage";
import { GitHubRepoPlaceholder } from "./GitHubRepoPlaceholder";
import { GitHubRepoLineIcon } from "./GitHubRepoLineIcon";

export const githubRepoView = makeModuleView(githubRepoV1, {
  LineIcon: GitHubRepoLineIcon,
  configureCommand: "configureGithubRepo",
  form: GitHubRepoForm,
  default: {
    defaultWidth: 480,
    minWidth: 320,
    placeholder() {
      return <GitHubRepoPlaceholder />;
    },
    component(props) {
      const { state } = props;
      if (state.data === null)
        return <p role="status">{state.resolution.error?.message ?? "Resolving…"}</p>;
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
    generator: { registry, defaultSpec: githubRepoV1.defaultSpec },
  },
});
