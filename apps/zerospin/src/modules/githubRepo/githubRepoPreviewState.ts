import type { IInferDecodedRow } from "@zerospin/shapes";
import type { githubRepoV1 } from "./githubRepoV1";

const defaultData = {
  name: "github-repo",
  description: "A sample GitHub repository card.",
  stargazers_count: 12,
  forks_count: 3,
  language: "TypeScript",
};

export const githubRepoPreviewState = {
  payload: { url: "https://github.com/morgs32/ink-steps" },
  data: defaultData,
} satisfies IInferDecodedRow<typeof githubRepoV1.stateShape>;
