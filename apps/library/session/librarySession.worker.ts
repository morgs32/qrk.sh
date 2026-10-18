import { makeSharedWorker } from "@zerospin/browser/makeSharedWorker";
import { librarySessionDefinition } from "./librarySessionDefinition";

makeSharedWorker({
  sqliteWasmUrl: new URL("@zerospin/browser/sqlite.wasm", import.meta.url).href,
  standaloneSessions: { library: { sessionDefinition: librarySessionDefinition } },
});
