import { Effect, Schema } from "effect";

import { ImageUploadEnvironment } from "./ImageUploadEnvironment";

export const uploadImage = Effect.fn("Image.uploadImage")(function* (props: { file: File }) {
  const { file } = props;
  const { uploadUrl, siteId, authorization } = yield* ImageUploadEnvironment;
  const header = yield* authorization;
  const body = new FormData();
  body.set("file", file);
  if (siteId !== null) body.set("siteId", siteId);
  const response = yield* Effect.tryPromise((signal) =>
    fetch(uploadUrl, {
      method: "POST",
      headers: header === null ? {} : { Authorization: header },
      body,
      signal,
    }),
  );
  const result: unknown = yield* Effect.tryPromise(() => response.json());
  if (!response.ok) {
    const error = yield* Schema.decodeUnknownEffect(
      Schema.Struct({ code: Schema.String, message: Schema.String }),
    )(result);
    return yield* Effect.fail(new Error(error.message));
  }
  const uploaded = yield* Schema.decodeUnknownEffect(
    Schema.Struct({ key: Schema.String, url: Schema.String, contentType: Schema.String }),
  )(result);
  return uploaded.url;
});
