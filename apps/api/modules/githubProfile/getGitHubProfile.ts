import { readRpcEnvelope } from "@zerospin/core/utils/readRpcEnvelope";
import { ensureZerospinError } from "@zerospin/error";
import { Effect } from "effect";

import { BackendRepo } from "../../BackendRepo";
import { normalizeGitHubUrl } from "./normalizeGitHubUrl";
import { scrapeGitHub } from "./scrapeGitHub";

export const getGitHubProfile = Effect.fn("getGitHubProfile")(function* (props: {
  url: string;
  token: string;
}) {
  const { url, token } = props;
  const canonicalUrl = yield* normalizeGitHubUrl(url);
  const payload = yield* scrapeGitHub({ url: canonicalUrl, token });
  const key = `github-profile:${canonicalUrl}`;
  yield* BackendRepo.getRepo({ key: {} }).pipe(
    Effect.flatMap((repo) =>
      Effect.tryPromise({
        try: () => repo.storeResponse({ key, payload }),
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
