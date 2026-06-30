import type { ISystemId } from "@zerospin/core/system/types";
import { exports as workerExports } from "cloudflare:workers";
import { Effect } from "effect";
import type { SystemWorker } from "system-worker";

export const getSystemWorker = Effect.fn("getSystemWorker")(function* (_props: {
  systemId: ISystemId;
  deployName: string;
}) {
  yield* Effect.void;
  const systemWorker = workerExports.SystemWorker;
  if (systemWorker === undefined) {
    throw new Error("Missing SystemWorker loopback export");
  }
  return systemWorker as unknown as SystemWorker;
});
