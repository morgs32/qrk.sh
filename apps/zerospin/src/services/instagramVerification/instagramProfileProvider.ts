import { makeZerospinError, type IAnyError } from "@zerospin/error";
import { Context, Effect, Layer, Schema } from "effect";

export class InstagramProfileProvider extends Context.Service<
  InstagramProfileProvider,
  {
    getProfile: (props: {
      senderScopedId: string;
    }) => Effect.Effect<{ username: string }, IAnyError>;
  }
>()("InstagramProfileProvider") {}

export const instagramProfileProviderLayer = Layer.succeed(InstagramProfileProvider, {
  getProfile: Effect.fn("InstagramProfileProvider.getProfile")(function* (props) {
    const { senderScopedId } = props;
    const { env } = yield* Effect.promise(() => import("cloudflare:workers"));
    const { INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_GRAPH_API_VERSION } =
      yield* Schema.decodeUnknownEffect(
        Schema.Struct({
          INSTAGRAM_ACCESS_TOKEN: Schema.NonEmptyString,
          INSTAGRAM_GRAPH_API_VERSION: Schema.String.check(Schema.isPattern(/^v\d+\.\d+$/)),
        }),
      )(env).pipe(
        Effect.mapError(() =>
          makeZerospinError({
            code: "instagram-provider-not-configured",
            message: "Instagram profile lookup is not configured.",
          }),
        ),
      );
    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(
          `https://graph.instagram.com/${INSTAGRAM_GRAPH_API_VERSION}/${encodeURIComponent(senderScopedId)}?fields=username`,
          {
            headers: { Authorization: `Bearer ${INSTAGRAM_ACCESS_TOKEN}` },
            signal: AbortSignal.timeout(20_000),
          },
        ),
      catch: () =>
        makeZerospinError({
          code: "instagram-profile-lookup-failed",
          message:
            "Instagram profile lookup could not reach Meta. Start a fresh verification to retry.",
        }),
    });
    if (!response.ok) {
      return yield* makeZerospinError({
        code: "instagram-profile-lookup-failed",
        message: "Instagram could not resolve this sender. Start a fresh verification to retry.",
      });
    }
    const body: unknown = yield* Effect.tryPromise({
      try: () => response.json(),
      catch: () =>
        makeZerospinError({
          code: "instagram-profile-lookup-failed",
          message: "Instagram returned an unreadable profile.",
        }),
    });
    return yield* Schema.decodeUnknownEffect(Schema.Struct({ username: Schema.NonEmptyString }))(
      body,
      {
        onExcessProperty: "ignore",
      },
    ).pipe(
      Effect.mapError(() =>
        makeZerospinError({
          code: "instagram-profile-lookup-failed",
          message: "Instagram returned an incomplete profile. Start a fresh verification to retry.",
        }),
      ),
    );
  }),
});
