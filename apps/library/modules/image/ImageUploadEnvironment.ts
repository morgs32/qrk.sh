import { Context, Effect } from "effect";

export class ImageUploadEnvironment extends Context.Service<
  ImageUploadEnvironment,
  {
    upload: (file: File) => Effect.Effect<string, Error>;
  }
>()("ImageUploadEnvironment") {}
