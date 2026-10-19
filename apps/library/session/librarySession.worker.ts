import { makeSharedWorker } from "@zerospin/browser/makeSharedWorker";
import sqliteWasmUrl from "@zerospin/browser/sqlite.wasm?url";
import { librarySessionDefinition } from "./librarySessionDefinition";

makeSharedWorker({
  sqliteWasmUrl,
  standaloneSessions: { library: { sessionDefinition: librarySessionDefinition } },
});
