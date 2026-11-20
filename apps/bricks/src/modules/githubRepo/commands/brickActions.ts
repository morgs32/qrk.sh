import { makeId, stageAggregateSessionCommand } from "@zerospin/sdk/browser";
import { makeEffectSchema } from "@zerospin/shapes";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import type { IModule } from "../../react/types";
import { brickV1 } from "../../../zerospin/models/brick/BrickV1";
import { addGithubRepoBrickV1 } from "./AddGithubRepoBrickV1";
import { updateGithubRepoBrickV1 } from "./UpdateGithubRepoBrickV1";

export function addBrick(props: Parameters<IModule<string>["add"]>[0]): ReturnType<IModule<string>["add"]> {
  const { session, pageId, target, layoutId, state } = props;
  if (layoutId !== "default") return { _tag: "Failure", failure: { message: "Invalid Brick layout" } };
  const brickId = session.runSync(makeId(brickV1));
  const decoded = Schema.decodeUnknownResult(Schema.toType(makeEffectSchema(addGithubRepoBrickV1.payload)))({ brickId, pageId, target, state });
  if (Result.isFailure(decoded)) return { _tag: "Failure", failure: { message: "Invalid Brick configuration" } };
  return stageAggregateSessionCommand({ session, contractName: "addGithubRepoBrick", payload: decoded.success });
}

export function updateBrick(props: Parameters<IModule<string>["update"]>[0]): ReturnType<IModule<string>["update"]> {
  const { session, brickId, state } = props;
  const decoded = Schema.decodeUnknownResult(Schema.toType(makeEffectSchema(updateGithubRepoBrickV1.payload)))({ brickId, state });
  if (Result.isFailure(decoded)) return { _tag: "Failure", failure: { message: "Invalid Brick content" } };
  return stageAggregateSessionCommand({ session, contractName: "updateGithubRepoBrick", payload: decoded.success });
}
