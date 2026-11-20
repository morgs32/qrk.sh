import { creatorFileIdSchema } from "@qrk.sh/bricks/creatorFile/creatorFileId";
import { pageV1 } from "@qrk.sh/bricks/zerospin/models/page/PageV1";
import { pageSnapshotV1 } from "@qrk.sh/bricks/zerospin/models/pageSnapshot/PageSnapshotV1";
import { siteV1 } from "@qrk.sh/bricks/zerospin/models/site/SiteV1";
import { site } from "@qrk.sh/bricks/zerospin/models/site/site";
import { userV1 } from "@qrk.sh/bricks/zerospin/models/user/UserV1";
import { assetV1 } from "@qrk.sh/zerospin/src/services/assets/AssetV1";
import { assetsV1 } from "@qrk.sh/zerospin/src/services/assets/assetsV1";
import { SecretKey } from "@zerospin/core/services/SecretKey";
import { getSystemApi } from "@zerospin/core/utils/getSystemApi/getSystemApi";
import { makeQueryDbVersion, ZerospinApiUrl } from "@zerospin/sdk";
import { makeIdSchema } from "@zerospin/sdk/browser";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import { corsHeaders, jsonResponse, requireClerkUserId, UploadHttpError } from "../http";

const userDb = makeQueryDbVersion({
  models: { user: userV1, site: siteV1, page: pageV1, pageSnapshot: pageSnapshotV1 },
});
const assetsDb = makeQueryDbVersion({ models: { asset: assetV1 } });
const uploadFields = Schema.Struct({ siteId: makeIdSchema(site), fileId: creatorFileIdSchema });
const imageTypes = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
const maxImageBytes = 5 * 1024 * 1024;

const upload = Effect.fn("creatorFiles.upload")(function* (props: {
  owner: string;
  siteId: typeof uploadFields.Type.siteId;
  fileId: typeof creatorFileIdSchema.Type;
  file: File;
  bucket: R2Bucket;
}) {
  const { owner, siteId, fileId, file, bucket } = props;
  const api = yield* getSystemApi();
  const uploadSite = yield* api.executeAggregateQuery({
    aggregateName: "user",
    aggregateVersion: 1,
    aggregateId: owner,
    query: userDb.query.site.findFirst({
      columns: { id: true },
      where: { id: { eq: siteId }, user: { clerkUserId: { eq: owner } } },
    }),
  });
  if (uploadSite === undefined) {
    return yield* Effect.fail(new UploadHttpError(404, "site-not-found", "Upload Site not found"));
  }

  const bytes = yield* Effect.promise(() => file.arrayBuffer());
  const digest = yield* Effect.promise(() => crypto.subtle.digest("SHA-256", bytes));
  const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const objectKey = `creator/${fileId}`;
  const { result: reservation } = yield* api.executeServiceCommand(assetsV1, {
    contractName: "reserveAsset",
    payload: {
      assetId: fileId,
      ownerAggregateId: owner,
      uploadSiteId: siteId,
      objectKey,
      contentType: file.type,
      size: file.size,
      sha256,
    },
  });
  if (reservation._tag === "Failure") {
    return yield* Effect.fail(new UploadHttpError(409, "asset-reservation-conflict", reservation.failure.message));
  }

  const written = yield* Effect.promise(() =>
    bucket.put(objectKey, bytes, {
      onlyIf: new Headers({ "If-None-Match": "*" }),
      sha256: digest,
      httpMetadata: { contentType: file.type },
    }),
  );
  if (written === null) {
    // A matching retry may follow a lost PUT response or a failed readiness command.
    const stored = yield* Effect.promise(() => bucket.head(objectKey));
    const storedDigest = stored?.checksums.sha256;
    if (
      stored === null ||
      stored.size !== file.size ||
      stored.httpMetadata?.contentType !== file.type ||
      storedDigest === undefined ||
      new Uint8Array(storedDigest).some((byte, index) => byte !== new Uint8Array(digest)[index])
    ) {
      return yield* Effect.fail(
        new UploadHttpError(409, "asset-content-conflict", "Stored bytes do not match this file ID"),
      );
    }
  }

  const { result: ready } = yield* api.executeServiceCommand(assetsV1, {
    contractName: "markAssetReady",
    payload: { assetId: fileId },
  });
  if (ready._tag === "Failure") {
    return yield* Effect.fail(new UploadHttpError(503, "asset-not-ready", "File readiness could not be confirmed"));
  }
  return { fileId };
});

const isPublished = Effect.fn("creatorFiles.isPublished")(function* (
  owner: string,
  fileId: typeof creatorFileIdSchema.Type,
) {
  const api = yield* getSystemApi();
  const subject = { aggregateName: "user", aggregateVersion: 1, aggregateId: owner };
  const favicons = yield* api.executeAggregateQuery({
    ...subject,
    query: userDb.query.site.findMany({
      columns: { faviconLightUrl: true, faviconDarkUrl: true },
      where: { isPublished: { eq: true }, user: { clerkUserId: { eq: owner } } },
    }),
  });
  if (favicons.some((site) => site.faviconLightUrl === fileId || site.faviconDarkUrl === fileId)) {
    return true;
  }

  const publishedPage = {
    isPublished: { eq: true },
    site: { isPublished: { eq: true }, user: { clerkUserId: { eq: owner } } },
  };
  // Reread the pointer with the snapshot, never authorizing from an old immutable row.
  for (let attempt = 0; attempt < 2; attempt++) {
    const pages = yield* api.executeAggregateQuery({
      ...subject,
      query: userDb.query.page.findMany({
        columns: { id: true, publishedSnapshotId: true },
        where: publishedPage,
      }),
    });
    let unstable = false;
    for (const page of pages) {
      const snapshotId = page.publishedSnapshotId;
      if (snapshotId === null) {
        unstable = true;
        continue;
      }
      const snapshot = yield* api.executeAggregateQuery({
        ...subject,
        query: userDb.query.pageSnapshot.findFirst({
          columns: { referencedAssetIds: true },
          where: {
            id: { eq: snapshotId },
            page: { ...publishedPage, id: { eq: page.id }, publishedSnapshotId: { eq: snapshotId } },
          },
        }),
      });
      if (snapshot === undefined) {
        unstable = true;
        continue;
      }
      if (snapshot.referencedAssetIds.includes(fileId)) return true;
    }
    if (!unstable) return false;
  }
  return false;
});

const read = Effect.fn("creatorFiles.read")(function* (props: {
  request: Request;
  owner: string | null;
  fileId: typeof creatorFileIdSchema.Type;
  bucket: R2Bucket;
}) {
  const { request, owner, fileId, bucket } = props;
  const api = yield* getSystemApi();
  const asset = yield* api.executeServiceQuery({
    serviceName: "assets",
    serviceVersion: 1,
    query: assetsDb.query.asset.findFirst({
      columns: { ownerAggregateId: true, objectKey: true, contentType: true },
      where: { id: { eq: fileId }, ready: { eq: true } },
    }),
  });
  if (asset === undefined) {
    return yield* Effect.fail(new UploadHttpError(404, "file-not-found", "File not found"));
  }

  const permitted = owner === null
    ? yield* isPublished(asset.ownerAggregateId, fileId)
    : owner === asset.ownerAggregateId;
  if (!permitted) {
    return yield* Effect.fail(new UploadHttpError(403, "file-forbidden", "File is not available"));
  }
  const object = yield* Effect.promise(() => bucket.get(asset.objectKey));
  if (object === null) {
    return yield* Effect.fail(new UploadHttpError(404, "file-not-found", "File not found"));
  }
  const headers = corsHeaders(request);
  headers.append("Vary", "Authorization");
  headers.set("Content-Type", asset.contentType);
  headers.set("X-Content-Type-Options", "nosniff");
  // An SVG served as a top-level document must not run active content.
  headers.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  return new Response(object.body, { headers });
});

export async function handleCreatorFiles(request: Request, env: Env, pathname: string) {
  let response: Response;
  try {
    const { CREATOR_FILES: bucket, ZEROSPIN_API_URL: endpoint, ZEROSPIN_SECRET_KEY: secret } = env;
    if (!bucket || !endpoint || !secret) {
      throw new UploadHttpError(503, "files-unavailable", "Creator files are not configured");
    }
    if (pathname === "/files" && request.method === "POST") {
      const owner = await requireClerkUserId(request, env);
      if (!(request.headers.get("Content-Type") ?? "").toLowerCase().startsWith("multipart/form-data;")) {
        throw new UploadHttpError(400, "invalid-content-type", "Expected multipart/form-data");
      }
      const form = await request.formData().catch(() => {
        throw new UploadHttpError(400, "invalid-form", "Invalid multipart upload");
      });
      const fields = Schema.decodeUnknownOption(uploadFields)({
        siteId: form.get("siteId"),
        fileId: form.get("fileId"),
      });
      if (fields._tag === "None") {
        throw new UploadHttpError(400, "invalid-upload-scope", "Expected a Site ID and a creator file ID");
      }
      const file = form.get("file");
      if (!(file instanceof File) || file.size === 0 || file.size > maxImageBytes) {
        throw new UploadHttpError(400, "invalid-file-size", "Choose a non-empty image up to 5 MiB");
      }
      if (!imageTypes.includes(file.type)) {
        throw new UploadHttpError(415, "unsupported-media-type", "Choose a PNG, JPEG, WebP, or SVG image");
      }
      const result = await Effect.runPromise(upload({ ...fields.value, owner, file, bucket }).pipe(
        Effect.provideService(ZerospinApiUrl, endpoint),
        Effect.provideService(SecretKey, Redacted.make(secret)),
      ));
      response = jsonResponse(request, result, 200);
    } else if (pathname.startsWith("/files/") && request.method === "GET") {
      const id = pathname.slice("/files/".length);
      const decoded = Schema.decodeUnknownOption(creatorFileIdSchema)(id);
      if (decoded._tag === "None") {
        throw new UploadHttpError(404, "file-not-found", "File not found");
      }
      const owner = request.headers.has("Authorization") ? await requireClerkUserId(request, env) : null;
      response = await Effect.runPromise(read({ request, owner, fileId: decoded.value, bucket }).pipe(
        Effect.provideService(ZerospinApiUrl, endpoint),
        Effect.provideService(SecretKey, Redacted.make(secret)),
      ));
    } else {
      throw new UploadHttpError(405, "method-not-allowed", "Use POST /files or GET /files/:fileId");
    }
  } catch (cause) {
    response = cause instanceof UploadHttpError
      ? jsonResponse(request, { code: cause.code, message: cause.message }, cause.status)
      : jsonResponse(request, { code: "files-unavailable", message: "Creator file request failed" }, 503);
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
