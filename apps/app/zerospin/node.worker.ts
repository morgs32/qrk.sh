import { makeSharedWorker } from "@zerospin/browser/makeSharedWorker";
import sqliteWasmUrl from "@zerospin/browser/sqlite.wasm?url";
import { userSessionDefinition } from "./userSessionDefinition";
import { userSessionDefinitionV3 } from "./userSessionDefinitionV3";

makeSharedWorker({
  sqliteWasmUrl,
  aggregateSessions: [
    { sessionDefinition: userSessionDefinitionV3 },
    { sessionDefinition: userSessionDefinition },
  ],
});
