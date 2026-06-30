import { Apis } from "apis/Apis/Apis";
import { newWorkersRpcResponse } from "capnweb";
import { env, WorkerEntrypoint } from "cloudflare:workers";

export { CloudRepo } from "apis/CloudRepo/CloudRepo";
export { AccountRepo } from "system-worker/AccountRepo/AccountRepo";
export { ActorRepo } from "system-worker/ActorRepo/ActorRepo";
export { AuthorizationRepo } from "system-worker/AuthorizationRepo/AuthorizationRepo";
export { FinalizedCommandRepo } from "system-worker/FinalizedCommandRepo/FinalizedCommandRepo";
export { FrontendRepo } from "system-worker/FrontendRepo/FrontendRepo";
export { FrontendWebSocketSubscriber } from "system-worker/FrontendWebSocketSubscriber";
export { SurfaceRepo } from "system-worker/SurfaceRepo/SurfaceRepo";
export { SystemRepo } from "system-worker/SystemRepo/SystemRepo";
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
