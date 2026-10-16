import { Context, Effect } from "effect";

export class ImageUploadEnvironment extends Context.Service<
  ImageUploadEnvironment,
  {
    uploadUrl: string;
    siteId: string | null;
    authorization: Effect.Effect<string | null, Error>;
  }
>()("ImageUploadEnvironment") {}
