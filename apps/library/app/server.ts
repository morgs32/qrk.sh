import handler from "@tanstack/react-start/server-entry";

import worker, {
  BrowserHost,
  FigmaBackend,
  GitHubBackend,
  GooglePlacesBackend,
  InstagramBackend,
  LinkBackend,
  StreamlineBackend,
} from "../worker/Worker";
import type { IScraperEnv } from "../worker/types";

export {
  BrowserHost,
  FigmaBackend,
  GitHubBackend,
  GooglePlacesBackend,
  InstagramBackend,
  LinkBackend,
  StreamlineBackend,
};

function shouldHandleWithLibraryWorker(request: Request): boolean {
  if (request.method === "OPTIONS") {
    return true;
  }
  const pathname = new URL(request.url).pathname;
  return pathname === "/rpc" || pathname === "/upload" || pathname.startsWith("/assets/");
}

// oxlint-disable-next-line import/no-default-export -- Cloudflare Worker entrypoint.
export default {
  fetch(request: Request, env: IScraperEnv): Promise<Response> | Response {
    if (shouldHandleWithLibraryWorker(request)) {
      return worker.fetch(request, env);
    }
    return handler.fetch(request);
  },
} satisfies ExportedHandler<IScraperEnv>;
