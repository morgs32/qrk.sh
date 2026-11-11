import { RpcTarget } from "capnweb";
import type { Spec } from "@json-render/core";
import type {
  IGitHubRepoPayload,
  IGitHubScrapePayload,
  IInstagramScrapePayload,
  IRpcEither,
} from "@qrk.sh/bricks/rpc/types";
import { Layer, ManagedRuntime } from "effect";

import { getBehanceProfile } from "./behance/getBehanceProfile";
import { encodeRpc } from "./encodeRpc";
import { generateSpec } from "./generateSpec";
import { getGitHubProfile } from "./githubProfile/getGitHubProfile";
import { getGitHubRepo } from "./githubRepo/getGitHubRepo";
import { getInstagramProfile } from "./instagram/getInstagramProfile";

const GLOBAL_BACKEND_NAME = "global";
const managedRuntime = ManagedRuntime.make(Layer.empty);

export class BricksApi extends RpcTarget {
  constructor(private readonly workerEnv: Env) {
    super();
  }

  getBehanceProfile(url: string) {
    return managedRuntime.runPromise(
      getBehanceProfile({ url, token: this.workerEnv.APIFY_API_TOKEN }).pipe(encodeRpc),
    );
  }

  getInstagramProfile(url: string): Promise<IRpcEither<IInstagramScrapePayload>> {
    return managedRuntime.runPromise(
      getInstagramProfile({
        url,
        token: this.workerEnv.APIFY_API_TOKEN,
        bucket: this.workerEnv.QRKSH,
        publicBaseUrl: this.workerEnv.R2_PUBLIC_BASE_URL,
      }).pipe(encodeRpc),
    );
  }

  getGitHubProfile(url: string): Promise<IRpcEither<IGitHubScrapePayload>> {
    return managedRuntime.runPromise(
      getGitHubProfile({ url, token: this.workerEnv.GITHUB_TOKEN }).pipe(encodeRpc),
    );
  }

  getGitHubRepo(url: string): Promise<IRpcEither<IGitHubRepoPayload>> {
    return managedRuntime.runPromise(
      getGitHubRepo({ url, token: this.workerEnv.GITHUB_TOKEN }).pipe(encodeRpc),
    );
  }

  figmaBackend() {
    return this.workerEnv.FIGMA_BACKEND.getByName(GLOBAL_BACKEND_NAME);
  }

  googlePlacesBackend() {
    return this.workerEnv.GOOGLE_PLACES_BACKEND.getByName(GLOBAL_BACKEND_NAME);
  }

  linkBackend() {
    return this.workerEnv.LINK_BACKEND.getByName(GLOBAL_BACKEND_NAME);
  }

  generateSpec(moduleId: string, prompt: string, state: unknown, currentSpec: Spec | null) {
    return generateSpec({
      env: this.workerEnv,
      moduleId,
      prompt,
      state,
      currentSpec,
    });
  }
}
