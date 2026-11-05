import { makeId } from "@zerospin/core/models/make/makeId";
import { SecretKey } from "@zerospin/core/services/SecretKey";
import { ZerospinApiUrl } from "@zerospin/core/services/ZerospinApiUrl";
import { getSystemApi } from "@zerospin/core/utils/getSystemApi/getSystemApi";
import { NanoIdFactory } from "@zerospin/core/utils/NanoIdFactory";
import { makeZerospinError } from "@zerospin/error";
import { Effect, Layer, Redacted, Schema } from "effect";

const InstagramWebhookConfigurationSchema = Schema.Struct({
  INSTAGRAM_APP_SECRET: Schema.optionalKey(Schema.String),
  INSTAGRAM_WEBHOOK_VERIFY_TOKEN: Schema.optionalKey(Schema.String),
  NEXT_PUBLIC_INSTAGRAM_RECEIVING_ACCOUNT_ID: Schema.optionalKey(Schema.String),
});

const InstagramWebhookBodySchema = Schema.Struct({
  object: Schema.NonEmptyString,
  entry: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        id: Schema.NonEmptyString,
        messaging: Schema.optionalKey(Schema.Array(Schema.Unknown)),
      }),
    ),
  ),
});

const InstagramMessageSchema = Schema.Struct({
  sender: Schema.optionalKey(Schema.Struct({ id: Schema.NonEmptyString })),
  recipient: Schema.optionalKey(Schema.Struct({ id: Schema.NonEmptyString })),
  message_edit: Schema.optionalKey(Schema.Unknown),
  message_delete: Schema.optionalKey(Schema.Unknown),
  message: Schema.optionalKey(
    Schema.Struct({
      mid: Schema.optionalKey(Schema.NonEmptyString),
      text: Schema.optionalKey(Schema.String),
      is_echo: Schema.optionalKey(Schema.Boolean),
      is_deleted: Schema.optionalKey(Schema.Boolean),
      is_edited: Schema.optionalKey(Schema.Boolean),
      is_unsupported: Schema.optionalKey(Schema.Boolean),
    }),
  ),
});

/** Verify Meta's transport evidence before admitting an account-verification message. */
export const handleInstagramVerificationWebhook = Effect.fn("handleInstagramVerificationWebhook")(
  function* (props: {
    request: Request;
    env: unknown;
    receiveMessage?: (message: {
      receivingAccountId: string;
      senderScopedId: string;
      messageId: string;
      code: string;
    }) => Promise<void>;
  }) {
    const { request, env, receiveMessage } = props;
    const deliverMessage =
      receiveMessage ??
      ((message) =>
        Effect.runPromise(
          Effect.gen(function* () {
            const { ZEROSPIN_API_URL, ZEROSPIN_SECRET_KEY } = yield* Schema.decodeUnknownEffect(
              Schema.Struct({
                ZEROSPIN_API_URL: Schema.NonEmptyString,
                ZEROSPIN_SECRET_KEY: Schema.NonEmptyString,
              }),
            )(env);
            const { instagramVerificationV1 } = yield* Effect.promise(
              () =>
                import("@qrk.sh/zerospin/src/services/instagramVerification/instagramVerificationV1"),
            );
            const { verifiedInstagramAccount } = yield* Effect.promise(
              () =>
                import("@qrk.sh/zerospin/src/services/instagramVerification/models/verifiedInstagramAccount/verifiedInstagramAccount"),
            );
            const program = Effect.gen(function* () {
              const api = yield* getSystemApi();
              const outcome = yield* api.executeServiceCommand(instagramVerificationV1, {
                contractName: "receiveInstagramVerificationMessage",
                payload: {
                  ...message,
                  verifiedAccountId: yield* makeId(verifiedInstagramAccount),
                },
              });
              if (outcome.result._tag === "Failure") {
                return yield* makeZerospinError(outcome.result.failure);
              }
            });
            yield* program.pipe(
              Effect.provide(
                Layer.mergeAll(
                  NanoIdFactory,
                  Layer.succeed(ZerospinApiUrl, ZEROSPIN_API_URL),
                  Layer.succeed(SecretKey, Redacted.make(ZEROSPIN_SECRET_KEY)),
                ),
              ),
            );
          }),
        ));
    const headers = { "Cache-Control": "no-store" };
    const configuration = Schema.decodeUnknownResult(InstagramWebhookConfigurationSchema)(env);
    if (configuration._tag === "Failure") {
      return Response.json({ code: "instagram-webhook-not-configured" }, { status: 503, headers });
    }
    const {
      INSTAGRAM_APP_SECRET,
      INSTAGRAM_WEBHOOK_VERIFY_TOKEN,
      NEXT_PUBLIC_INSTAGRAM_RECEIVING_ACCOUNT_ID,
    } = configuration.success;

    // 1. Subscription verification uses its own token, never the app signing secret.
    if (request.method === "GET") {
      if (!INSTAGRAM_WEBHOOK_VERIFY_TOKEN) {
        return Response.json(
          { code: "instagram-webhook-not-configured" },
          { status: 503, headers },
        );
      }
      const query = new URL(request.url).searchParams;
      const challenge = query.get("hub.challenge");
      if (
        query.get("hub.mode") !== "subscribe" ||
        query.get("hub.verify_token") !== INSTAGRAM_WEBHOOK_VERIFY_TOKEN ||
        challenge === null ||
        challenge === ""
      ) {
        return Response.json(
          { code: "instagram-webhook-verification-failed" },
          { status: 403, headers },
        );
      }
      return new Response(challenge, { headers });
    }
    if (request.method !== "POST") {
      return Response.json(
        { code: "method-not-allowed" },
        { status: 405, headers: { ...headers, Allow: "GET, POST" } },
      );
    }
    if (!INSTAGRAM_APP_SECRET || !NEXT_PUBLIC_INSTAGRAM_RECEIVING_ACCOUNT_ID) {
      return Response.json({ code: "instagram-webhook-not-configured" }, { status: 503, headers });
    }

    // 2. Authenticate the exact body bytes before parsing or dispatching any message.
    const signature = /^sha256=([a-fA-F0-9]{64})$/.exec(
      request.headers.get("X-Hub-Signature-256") ?? "",
    );
    if (signature === null) {
      return Response.json(
        { code: "instagram-webhook-signature-invalid" },
        { status: 403, headers },
      );
    }
    const body = yield* Effect.tryPromise(() => request.arrayBuffer()).pipe(
      Effect.orElseSucceed(() => null),
    );
    if (body === null) {
      return Response.json({ code: "instagram-webhook-body-invalid" }, { status: 400, headers });
    }
    const signatureBytes = Uint8Array.from({ length: 32 }, (_, index) =>
      Number.parseInt(signature[1].slice(index * 2, index * 2 + 2), 16),
    );
    const verified = yield* Effect.tryPromise(async () => {
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(INSTAGRAM_APP_SECRET),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"],
      );
      return crypto.subtle.verify("HMAC", key, signatureBytes, body);
    }).pipe(Effect.orElseSucceed(() => false));
    if (!verified) {
      return Response.json(
        { code: "instagram-webhook-signature-invalid" },
        { status: 403, headers },
      );
    }
    const decoded = Schema.decodeUnknownResult(Schema.fromJsonString(InstagramWebhookBodySchema))(
      new TextDecoder().decode(body),
    );
    if (decoded._tag === "Failure") {
      return Response.json({ code: "instagram-webhook-body-invalid" }, { status: 400, headers });
    }
    const { object, entry: entries } = decoded.success;
    if (object !== "instagram") {
      return new Response("EVENT_RECEIVED", { headers });
    }
    if (entries === undefined) {
      return Response.json({ code: "instagram-webhook-body-invalid" }, { status: 400, headers });
    }

    // 3. Only original text messages to the configured receiver may consume a challenge.
    for (const entry of entries) {
      if (entry.id !== NEXT_PUBLIC_INSTAGRAM_RECEIVING_ACCOUNT_ID || entry.messaging === undefined)
        continue;
      for (const event of entry.messaging) {
        const decodedMessage = Schema.decodeUnknownResult(InstagramMessageSchema)(event);
        if (decodedMessage._tag === "Failure") {
          return Response.json(
            { code: "instagram-webhook-message-invalid" },
            { status: 400, headers },
          );
        }
        const { sender, recipient, message, message_edit, message_delete } = decodedMessage.success;
        if (
          message === undefined ||
          message_edit !== undefined ||
          message_delete !== undefined ||
          message.is_echo === true ||
          message.is_deleted === true ||
          message.is_edited === true ||
          message.is_unsupported === true ||
          message.text === undefined
        )
          continue;
        if (sender === undefined || recipient === undefined || message.mid === undefined) {
          return Response.json(
            { code: "instagram-webhook-message-invalid" },
            { status: 400, headers },
          );
        }
        if (
          recipient.id !== NEXT_PUBLIC_INSTAGRAM_RECEIVING_ACCOUNT_ID ||
          sender.id === NEXT_PUBLIC_INSTAGRAM_RECEIVING_ACCOUNT_ID
        )
          continue;
        const messageId = message.mid;
        const code = message.text.trim();
        if (!/^[a-f0-9]{32}$/.test(code)) continue;

        // 4. Acknowledge only retained receive-command completion; lookup finishes separately.
        const delivered = yield* Effect.tryPromise(() =>
          deliverMessage({
            receivingAccountId: NEXT_PUBLIC_INSTAGRAM_RECEIVING_ACCOUNT_ID,
            senderScopedId: sender.id,
            messageId,
            code,
          }),
        ).pipe(
          Effect.as(true),
          Effect.orElseSucceed(() => false),
        );
        if (!delivered) {
          return Response.json(
            { code: "instagram-webhook-delivery-failed" },
            { status: 503, headers: { ...headers, "Retry-After": "5" } },
          );
        }
      }
    }
    return new Response("EVENT_RECEIVED", { headers });
  },
);
