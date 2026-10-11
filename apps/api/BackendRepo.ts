import { RoutePattern } from "@remix-run/route-pattern";
import { makeDbConfig } from "@zerospin/core/drizzle/make/makeDbConfig/makeDbConfig";
import { catchZerospinError, type IZerospinErrorJson } from "@zerospin/error";
import { makeRpcEnvelope, type IRpcEnvelope } from "@zerospin/logger";
import { makeTable, primitives } from "@zerospin/shapes";
import { Effect, Layer, ManagedRuntime, Schema } from "effect";
import { DurableObject } from "cloudflare:workers";
import { makeMigratableDORepo } from "system-worker/makeMigratableDORepo/makeMigratableDORepo";
import { makeMigratableDORepoConfig } from "system-worker/makeMigratableDORepo/makeMigratableDORepoConfig";

const managedRuntime = ManagedRuntime.make(Layer.empty);
const responses = makeTable({
  name: "responses",
  shape: {
    key: primitives.text({ unique: true }),
    payload: primitives.json({ schema: Schema.Json }),
  },
});

const backendRepo = makeMigratableDORepo(DurableObject<Cloudflare.Env>, {
  namespaceBinding: "BACKEND_REPO",
  managedRuntime,
  migratableDORepoConfig: makeMigratableDORepoConfig({
    namePattern: RoutePattern.parse("/global"),
    dbConfig: makeDbConfig({ tables: { responses } }),
    migrations: [
      {
        id: 1,
        name: "create-responses",
        sql: ["CREATE TABLE responses (key TEXT NOT NULL UNIQUE, payload TEXT NOT NULL);"],
      },
    ],
  }),
});

export class BackendRepo extends backendRepo {
  storeResponse(props: {
    key: string;
    payload: unknown;
  }): Promise<IRpcEnvelope<void, IZerospinErrorJson>> {
    const { key, payload } = props;
    return managedRuntime.runPromise(
      Effect.gen({ self: this }, function* () {
        const json = yield* Schema.decodeUnknownEffect(Schema.Json)(payload);
        const row = yield* responses.encodeRow({ key, payload: json });
        yield* Effect.try({
          try: () => {
            this.db
              .insert(this.schema.responses)
              .values(row)
              .onConflictDoUpdate({
                target: this.schema.responses.key,
                set: { payload: row.payload },
              })
              .run();
          },
          catch: catchZerospinError({ code: "backend-response-store-failed" }),
        });
      }).pipe(
        Effect.mapError(catchZerospinError({ code: "backend-response-store-failed" })),
        (program) => makeRpcEnvelope(program),
      ),
    );
  }
}

declare global {
  namespace Cloudflare {
    interface DORepoNamespaces {
      BACKEND_REPO: DurableObjectNamespace<BackendRepo>;
    }
  }
}
