import { makeSharedWorker } from "@zerospin/browser/makeSharedWorker";
import sqliteWasmUrl from "@zerospin/browser/sqlite.wasm?url";
import { usersSessionDefinition } from "./usersSessionDefinition";
makeSharedWorker({ sqliteWasmUrl, sessionDefinition: usersSessionDefinition });
