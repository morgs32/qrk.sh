import { RpcTarget } from "capnweb";
import { BrandTypeId } from "effect/Brand";

import type { IScraperEnv } from "./types";

const GLOBAL_REPO_NAME = "global";

export class ScraperApi extends RpcTarget {
  declare [BrandTypeId]: "Apis";

  constructor(private readonly workerEnv: IScraperEnv) {
    super();
  }

  linktreeRepo() {
    return this.workerEnv.LINKTREE_REPO.getByName(GLOBAL_REPO_NAME);
  }

  beaconsRepo() {
    return this.workerEnv.BEACONS_REPO.getByName(GLOBAL_REPO_NAME);
  }

  instagramRepo() {
    return this.workerEnv.INSTAGRAM_REPO.getByName(GLOBAL_REPO_NAME);
  }

  githubRepo() {
    return this.workerEnv.GITHUB_REPO.getByName(GLOBAL_REPO_NAME);
  }

  tiktokRepo() {
    return this.workerEnv.TIKTOK_REPO.getByName(GLOBAL_REPO_NAME);
  }

  youtubeRepo() {
    return this.workerEnv.YOUTUBE_REPO.getByName(GLOBAL_REPO_NAME);
  }

  truthSocialRepo() {
    return this.workerEnv.TRUTH_SOCIAL_REPO.getByName(GLOBAL_REPO_NAME);
  }
}
