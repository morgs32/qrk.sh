import { makeSharedWorker } from "@zerospin/browser/makeSharedWorker";
import sqliteWasmUrl from "@zerospin/browser/sqlite.wasm?url";
import { userSessionDefinition } from "./userSessionDefinition";

makeSharedWorker({
  sqliteWasmUrl,
  aggregateSessions: [{ sessionDefinition: userSessionDefinition }],
});
