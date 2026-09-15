import { RpcTarget } from "capnweb";

import type { IScraperEnv } from "./types";

const GLOBAL_REPO_NAME = "global";

export class ScraperApi extends RpcTarget {
  constructor(private readonly workerEnv: IScraperEnv) {
    super();
  }

  linktreeRepo() {
    return this.workerEnv.LINKTREE_REPO.getByName(GLOBAL_REPO_NAME);
  }
}
