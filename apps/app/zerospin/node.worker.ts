import { makeSharedWorker } from "@zerospin/browser/makeSharedWorker";
import sqliteWasmUrl from "@zerospin/browser/sqlite.wasm?url";
import { userSessionDefinition, userSessionDefinitionV3 } from "./userSessionDefinition";

makeSharedWorker({
  sqliteWasmUrl,
  aggregateSessions: [
    { sessionDefinition: userSessionDefinitionV3 },
    { sessionDefinition: userSessionDefinition },
  ],
});
