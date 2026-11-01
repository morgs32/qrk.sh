import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { handleDevelopmentSignIn } from "./handleDevelopmentSignIn.ts";

const originalFetch = globalThis.fetch;
const originalEnvironment = { ...process.env };
let calls;
beforeEach(() => {
  process.env.NODE_ENV = "development";
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_" + btoa("example.clerk.accounts.dev$");
  process.env.CLERK_SECRET_KEY = "sk_test_example";
  calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return String(url).includes("sign_in_tokens")
      ? Response.json({ token: "one-use-ticket" })
      : Response.json([{ id: "user_one" }]);
  };
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env = { ...originalEnvironment };
});
const request = (
  path = "/signed-in",
  body = { currentUserId: null },
  origin = "https://app.example.localhost",
) =>
  new Request(
    "https://app.example.localhost/__dev/log-me-in/one%40example.com?returnTo=" +
      encodeURIComponent(path),
    {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

test("GET loads Clerk without issuing tickets or exposing the secret", async () => {
  const response = await handleDevelopmentSignIn(
    new Request("https://app.example.localhost/__dev/log-me-in/one%40example.com"),
    "one@example.com",
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const html = await response.text();
  assert.match(html, /clerk.browser.js/);
  assert.doesNotMatch(html, /sk_test_example|one-use-ticket/);
  assert.equal(calls.length, 0);
});
test("issues a short-lived ticket for an existing user", async () => {
  const response = await handleDevelopmentSignIn(request(), "one@example.com");
  assert.deepEqual(await response.json(), {
    ok: true,
    userId: "user_one",
    token: "one-use-ticket",
    returnTo: "/signed-in",
  });
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    user_id: "user_one",
    expires_in_seconds: 60,
  });
  assert.equal(calls.length, 2);
});
test("reuses a matching browser identity without issuing a ticket", async () => {
  const response = await handleDevelopmentSignIn(
    request("/", { currentUserId: "user_one" }),
    "one@example.com",
  );
  assert.equal((await response.json()).token, null);
  assert.equal(calls.length, 1);
});
test("issues a ticket when switching users", async () => {
  const response = await handleDevelopmentSignIn(
    request("/", { currentUserId: "user_other" }),
    "one@example.com",
  );
  assert.equal((await response.json()).token, "one-use-ticket");
});
test("unknown users are not created", async () => {
  globalThis.fetch = async () => Response.json([]);
  const response = await handleDevelopmentSignIn(request(), "missing@example.com");
  assert.equal(response.status, 404);
  assert.match((await response.json()).message, /No unique development account/);
});
test("provider errors are reported without leaking details", async () => {
  globalThis.fetch = async () => {
    throw new Error("secret provider details");
  };
  const response = await handleDevelopmentSignIn(request(), "one@example.com");
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /secret provider details/);
});
test("rejects cross-origin POSTs before calling Clerk", async () => {
  const response = await handleDevelopmentSignIn(
    request("/", {}, "https://attacker.example"),
    "one@example.com",
  );
  assert.equal(response.status, 403);
  assert.equal(calls.length, 0);
});
test("returns 404 for production mode and live keys", async () => {
  for (const [name, value] of [
    ["NODE_ENV", "production"],
    ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_live_example"],
    ["CLERK_SECRET_KEY", "sk_live_example"],
  ]) {
    const previous = process.env[name];
    process.env[name] = value;
    assert.equal((await handleDevelopmentSignIn(request(), "one@example.com")).status, 404);
    process.env[name] = previous;
  }
  assert.equal(calls.length, 0);
});
test("preserves local paths and rejects external redirects and login loops", async () => {
  for (const path of [
    "https://example.com",
    "//example.com",
    "/%2fexample.com",
    "/\\example.com",
    "/%5cexample.com",
    "/%0aexample.com",
    "/x/..//example.com",
    "/sign-in",
    "/x/../__dev/log-me-in/one",
    "/%5f%5fdev/log-me-in/one",
    "/%ZZ",
  ]) {
    const response = await handleDevelopmentSignIn(request(path), "one@example.com");
    assert.equal((await response.json()).returnTo, "/", path);
  }
  const response = await handleDevelopmentSignIn(
    request("/profile?tab=one#details"),
    "one@example.com",
  );
  assert.equal((await response.json()).returnTo, "/profile?tab=one#details");
});

test("email configuration cannot escape the script element", async () => {
  const email = "</script><script>alert(1)</script>@example.com";
  const response = await handleDevelopmentSignIn(
    new Request("https://app.example.localhost/__dev/log-me-in/example"),
    email,
  );
  const html = await response.text();
  const configuration = html.match(/const configuration = (.*);/)[1];
  assert.equal(JSON.parse(configuration).email, email);
  assert.equal(configuration.includes("<"), false);
});

test("accepts the public request origin behind the development proxy", async () => {
  const request = new Request("http://localhost:16404/__dev/log-me-in/one%40example.com", {
    method: "POST",
    headers: {
      Host: "qrk.localhost",
      "X-Forwarded-Proto": "https",
      Origin: "https://qrk.localhost",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ currentUserId: null }),
  });
  const response = await handleDevelopmentSignIn(request, "one@example.com");
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);
});
