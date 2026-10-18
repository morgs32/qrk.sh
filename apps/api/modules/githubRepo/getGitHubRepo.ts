import { readRpcEnvelope } from "@zerospin/core/utils/readRpcEnvelope";
import { ensureZerospinError } from "@zerospin/error";
import { Effect } from "effect";

import { BackendRepo } from "../../BackendRepo";
import { fetchGitHubRepo } from "./fetchGitHubRepo";
import { normalizeGitHubRepoUrl } from "./normalizeGitHubRepoUrl";

export const getGitHubRepo = Effect.fn("getGitHubRepo")(function* (props: {
  url: string;
  token: string;
}) {
  const { url, token } = props;
  const { canonicalUrl, owner, repo } = yield* normalizeGitHubRepoUrl(url);
  const payload = yield* fetchGitHubRepo({ owner, repo, token });
  const key = `github-repo:${canonicalUrl}`;
  yield* BackendRepo.getRepo({ key: {} }).pipe(
    Effect.flatMap((backend) =>
      Effect.tryPromise({
        try: () => backend.storeResponse({ key, payload }),
        catch: (error) => ensureZerospinError({ code: "backend-response-retention-failed", error }),
      }),
    ),
    Effect.flatMap(readRpcEnvelope),
    Effect.catch((error) =>
      Effect.sync(() => {
        console.error(JSON.stringify({ event: "backend-response-retention-failed", key, error }));
      }),
    ),
  );
  return payload;
});
