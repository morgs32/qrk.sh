import { makeSharedWorker } from "@zerospin/browser/makeSharedWorker";
import sqliteWasmUrl from "@zerospin/browser/sqlite.wasm?url";
import { instagramVerificationSessionDefinition } from "./instagramVerificationSessionDefinition";

makeSharedWorker({
  sqliteWasmUrl,
  sessionDefinition: instagramVerificationSessionDefinition,
});
