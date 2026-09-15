import { RpcTarget } from "capnweb";

import type { IScraperEnv } from "./types";

const GLOBAL_REPO_NAME = "global";

export class ScraperApi extends RpcTarget {
  constructor(private readonly workerEnv: IScraperEnv) {
    super();
  }

  instagramRepo() {
    return this.workerEnv.INSTAGRAM_REPO.getByName(GLOBAL_REPO_NAME);
  }

  githubRepo() {
    return this.workerEnv.GITHUB_REPO.getByName(GLOBAL_REPO_NAME);
  }

  figmaRepo() {
    return this.workerEnv.FIGMA_REPO.getByName(GLOBAL_REPO_NAME);
  }

  googlePlacesRepo() {
    return this.workerEnv.GOOGLE_PLACES_REPO.getByName(GLOBAL_REPO_NAME);
  }

  linkRepo() {
    return this.workerEnv.LINK_REPO.getByName(GLOBAL_REPO_NAME);
  }

  tiktokRepo() {
    return this.workerEnv.TIKTOK_REPO.getByName(GLOBAL_REPO_NAME);
  }

  streamlineRepo() {
    return this.workerEnv.STREAMLINE_REPO.getByName(GLOBAL_REPO_NAME);
  }
}
