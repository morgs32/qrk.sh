import { Apis } from "apis/Apis/Apis";
import { newWorkersRpcResponse } from "capnweb";
import { env, WorkerEntrypoint } from "cloudflare:workers";

export { CloudRepo } from "apis/CloudRepo/CloudRepo";
export { AccountRepo } from "system-worker";
export { ActorRepo } from "system-worker";
export { AuthorizationRepo } from "system-worker";
export { FinalizedCommandRepo } from "system-worker";
export { FrontendRepo } from "system-worker";
export { FrontendWebSocketSubscriber } from "system-worker";
export { SurfaceRepo } from "system-worker";
export { SystemRepo } from "system-worker";
export {
  AccountDeltaFanout,
  ActorDeltaFanout,
  FrontendDeltaFanout,
  SurfaceDeltaFanout,
  SystemWorker,
} from "system-worker";

export default class QrkE2eWorker extends WorkerEntrypoint {
  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/ws-subscriber/")) {
      const name = decodeURIComponent(url.pathname.slice("/ws-subscriber/".length));
      return env.FRONTEND_WEBSOCKET_SUBSCRIBER.getByName(name).fetch(request);
    }

    return newWorkersRpcResponse(request, new Apis());
  }
}
