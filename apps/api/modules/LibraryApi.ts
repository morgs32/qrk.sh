import { RpcTarget } from "capnweb";
import type { Spec } from "@json-render/core";
import { Layer, ManagedRuntime } from "effect";

import { encodeRpc } from "./encodeRpc";
import { generateSpec } from "./generateSpec";
import { getGitHubProfile } from "./githubProfile/getGitHubProfile";
import { getGitHubRepo } from "./githubRepo/getGitHubRepo";
import type { IGitHubRepoPayload, IGitHubScrapePayload, IRpcEither } from "./types";

const GLOBAL_BACKEND_NAME = "global";
const managedRuntime = ManagedRuntime.make(Layer.empty);

export class LibraryApi extends RpcTarget {
  constructor(private readonly workerEnv: Env) {
    super();
  }

  instagramBackend() {
    return this.workerEnv.INSTAGRAM_BACKEND.getByName(GLOBAL_BACKEND_NAME);
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

  streamlineBackend() {
    return this.workerEnv.STREAMLINE_BACKEND.getByName(GLOBAL_BACKEND_NAME);
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
