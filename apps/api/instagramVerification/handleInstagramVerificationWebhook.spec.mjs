import assert from "node:assert/strict";
import { test } from "node:test";
import { Effect } from "effect";

import { handleInstagramVerificationWebhook } from "./handleInstagramVerificationWebhook.ts";

const env = {
  INSTAGRAM_APP_SECRET: "test-app-secret",
  INSTAGRAM_WEBHOOK_VERIFY_TOKEN: "test-verification-token",
  NEXT_PUBLIC_INSTAGRAM_RECEIVING_ACCOUNT_ID: "receiver_one",
};
const code = "0123456789abcdef0123456789abcdef";
const originalMessage = {
  sender: { id: "sender_one" },
  recipient: { id: "receiver_one" },
  message: { mid: "message_one", text: ` ${code}\n` },
};

async function signedRequest(body) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.INSTAGRAM_APP_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text));
  return new Request("https://api.qrk.localhost/webhooks/instagram", {
    method: "POST",
    headers: {
      "X-Hub-Signature-256":
        "sha256=" +
        Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join(
          "",
        ),
    },
    body: text,
  });
}

test("GET verifies the subscription without accepting messages or exposing credentials", async () => {
  let calls = 0;
  const receiveMessage = async () => {
    calls += 1;
  };
  for (const [token, status] of [
    ["test-verification-token", 200],
    ["wrong-token", 403],
  ]) {
    const response = await Effect.runPromise(
      handleInstagramVerificationWebhook({
        request: new Request(
          "https://api.qrk.localhost/webhooks/instagram?hub.mode=subscribe&hub.verify_token=" +
            token +
            "&hub.challenge=challenge_one",
        ),
        env,
        receiveMessage,
      }),
    );
    assert.equal(response.status, status);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    const body = await response.text();
    if (status === 200) assert.equal(body, "challenge_one");
    assert.doesNotMatch(body, /test-app-secret|test-verification-token/);
  }
  assert.equal(calls, 0);
});

test("POST rejects an invalid signature before decoding malformed input or dispatching", async () => {
  let calls = 0;
  const response = await Effect.runPromise(
    handleInstagramVerificationWebhook({
      request: new Request("https://api.qrk.localhost/webhooks/instagram", {
        method: "POST",
        headers: { "X-Hub-Signature-256": "sha256=" + "0".repeat(64) },
        body: "not-json",
      }),
      env,
      receiveMessage: async () => {
        calls += 1;
      },
    }),
  );
  assert.equal(response.status, 403);
  assert.equal(calls, 0);
});

test("POST admits an original message and waits for retained command completion", async () => {
  const calls = [];
  let finish;
  const delivery = new Promise((resolve) => {
    finish = resolve;
  });
  let announceReceived;
  const received = new Promise((resolve) => {
    announceReceived = resolve;
  });
  let completed = false;
  const responsePromise = Effect.runPromise(
    handleInstagramVerificationWebhook({
      request: await signedRequest({
        object: "instagram",
        entry: [{ id: "receiver_one", messaging: [originalMessage] }],
      }),
      env,
      receiveMessage: async (message) => {
        calls.push(message);
        announceReceived();
        await delivery;
      },
    }),
  );
  responsePromise.then(() => {
    completed = true;
  });
  await received;
  assert.equal(completed, false);
  assert.deepEqual(calls, [
    {
      receivingAccountId: "receiver_one",
      senderScopedId: "sender_one",
      messageId: "message_one",
      code,
    },
  ]);
  finish();
  const response = await responsePromise;
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "EVENT_RECEIVED");
});

test("POST ignores other receivers, echo, self, edited, deleted and unsupported messages", async () => {
  const calls = [];
  const ignoredMessages = [
    { ...originalMessage, recipient: { id: "receiver_other" } },
    { ...originalMessage, sender: { id: "receiver_one" } },
    { ...originalMessage, message: { ...originalMessage.message, is_echo: true } },
    { ...originalMessage, message: { ...originalMessage.message, is_edited: true } },
    { ...originalMessage, message: { ...originalMessage.message, is_deleted: true } },
    { ...originalMessage, message: { ...originalMessage.message, is_unsupported: true } },
    { ...originalMessage, message_edit: {} },
    { ...originalMessage, message_delete: {} },
    { ...originalMessage, message: { mid: "image_one", attachments: [] } },
    { ...originalMessage, message: { ...originalMessage.message, text: `verify ${code}` } },
    { read: { mid: "read_one" } },
  ];
  const response = await Effect.runPromise(
    handleInstagramVerificationWebhook({
      request: await signedRequest({
        object: "instagram",
        entry: [
          { id: "receiver_other", messaging: [originalMessage] },
          { id: "receiver_one", messaging: ignoredMessages },
        ],
      }),
      env,
      receiveMessage: async (message) => {
        calls.push(message);
      },
    }),
  );
  assert.equal(response.status, 200);
  assert.equal(calls.length, 0);
});

test("POST returns a retryable response when retained command delivery fails", async () => {
  const body = {
    object: "instagram",
    entry: [{ id: "receiver_one", messaging: [originalMessage] }],
  };
  const calls = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await Effect.runPromise(
      handleInstagramVerificationWebhook({
        request: await signedRequest(body),
        env,
        receiveMessage: async (message) => {
          calls.push(message);
          if (attempt === 0) throw new Error("transport unavailable");
        },
      }),
    );
    assert.equal(response.status, attempt === 0 ? 503 : 200);
    if (attempt === 0) assert.equal(response.headers.get("Retry-After"), "5");
  }
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], calls[1]);
});

test("POST rejects signed malformed payloads without dispatching", async () => {
  let calls = 0;
  for (const body of [
    "not-json",
    { object: "instagram" },
    {
      object: "instagram",
      entry: [{ id: "receiver_one", messaging: [{ message: { text: code } }] }],
    },
  ]) {
    const response = await Effect.runPromise(
      handleInstagramVerificationWebhook({
        request: await signedRequest(body),
        env,
        receiveMessage: async () => {
          calls += 1;
        },
      }),
    );
    assert.equal(response.status, 400);
  }
  assert.equal(calls, 0);
});

test("missing setup fails explicitly and unsupported HTTP methods are refused", async () => {
  const receiveMessage = async () => {
    assert.fail("No message should be admitted");
  };
  const unavailable = await Effect.runPromise(
    handleInstagramVerificationWebhook({
      request: await signedRequest({ object: "instagram", entry: [] }),
      env: {},
      receiveMessage,
    }),
  );
  assert.equal(unavailable.status, 503);
  const missingDeliveryCredentials = await Effect.runPromise(
    handleInstagramVerificationWebhook({
      request: await signedRequest({
        object: "instagram",
        entry: [{ id: "receiver_one", messaging: [originalMessage] }],
      }),
      env,
    }),
  );
  assert.equal(missingDeliveryCredentials.status, 503);
  assert.deepEqual(await missingDeliveryCredentials.json(), {
    code: "instagram-webhook-delivery-failed",
  });
  const unsupported = await Effect.runPromise(
    handleInstagramVerificationWebhook({
      request: new Request("https://api.qrk.localhost/webhooks/instagram", { method: "PUT" }),
      env,
      receiveMessage,
    }),
  );
  assert.equal(unsupported.status, 405);
  assert.equal(unsupported.headers.get("Allow"), "GET, POST");
});
