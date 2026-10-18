import { makeSharedWorker } from "@zerospin/browser/makeSharedWorker";
import { userSessionDefinition } from "./userSessionDefinition";

makeSharedWorker({
  sqliteWasmUrl: new URL("@zerospin/browser/sqlite.wasm", import.meta.url).href,
  aggregateSessions: [{ sessionDefinition: userSessionDefinition }],
});
