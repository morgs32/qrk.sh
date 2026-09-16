import { RpcTarget } from "capnweb";

import type { IScraperEnv } from "./types";

const GLOBAL_BACKEND_NAME = "global";

export class ScraperApi extends RpcTarget {
  constructor(private readonly workerEnv: IScraperEnv) {
    super();
  }

  instagramBackend() {
    return this.workerEnv.INSTAGRAM_BACKEND.getByName(GLOBAL_BACKEND_NAME);
  }

  githubBackend() {
    return this.workerEnv.GITHUB_BACKEND.getByName(GLOBAL_BACKEND_NAME);
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
}
