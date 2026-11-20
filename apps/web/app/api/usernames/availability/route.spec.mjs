import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Effect from "effect/Effect";

const mocks = vi.hoisted(() => ({
  verifyToken: vi.fn(),
  makeSystemSpec: vi.fn(),
  executeServiceQuery: vi.fn(),
  executeAggregateQuery: vi.fn(),
  executeServiceCommand: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({ verifyToken: mocks.verifyToken }));
vi.mock("@zerospin/core/utils/getSystemApi/getSystemApi", async () => {
  const Effect = await import("effect/Effect");
  return {
    getSystemApi: () =>
      Effect.succeed({
        makeSystemSpec: mocks.makeSystemSpec,
        executeServiceQuery: mocks.executeServiceQuery,
        executeAggregateQuery: mocks.executeAggregateQuery,
        executeServiceCommand: mocks.executeServiceCommand,
      }),
  };
});

import { GET, OPTIONS } from "./route";
import { POST } from "../assignment/route";

describe("username availability", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.ZEROSPIN_API_URL = "https://zerospin.qrk.localhost";
    process.env.ZEROSPIN_SECRET_KEY = "test-only-secret";
    process.env.NEXT_PUBLIC_APP_ORIGIN = "https://app.qrk.localhost";
    process.env.CLERK_SECRET_KEY = "test-only-clerk-secret";
    mocks.verifyToken.mockResolvedValue({ sub: "user_one" });
    mocks.makeSystemSpec.mockReturnValue(
      Effect.succeed({
        services: { users: { canonical: 1, releases: { 1: { models: { username: 1 } } } } },
      }),
    );
    mocks.executeServiceQuery.mockReturnValue(Effect.succeed(undefined));
  });
  it("authenticates and reads only the requested name", async () => {
    const request = new Request(
      "https://qrk.localhost/api/usernames/availability?username=morgan",
      { headers: { origin: "https://app.qrk.localhost", authorization: "Bearer token" } },
    );
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ available: true });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBe("https://app.qrk.localhost");
    expect(mocks.verifyToken).toHaveBeenCalledWith("token", {
      secretKey: "test-only-clerk-secret",
      authorizedParties: ["https://app.qrk.localhost"],
    });
    expect(
      mocks.executeServiceQuery.mock.calls[0][0].query.prepareRead().request.config.where,
    ).toEqual({ username: { eq: "morgan" } });
    mocks.executeServiceQuery.mockReturnValue(Effect.succeed({ aggregateId: "user_two" }));
    expect(await (await GET(request)).json()).toEqual({ available: false });
    mocks.executeServiceQuery.mockReturnValue(Effect.succeed({ aggregateId: "user_one" }));
    expect(await (await GET(request)).json()).toEqual({ available: true });
  });
  it("rejects unauthenticated, malformed and foreign-origin requests", async () => {
    expect(
      (await GET(new Request("https://qrk.localhost/api/usernames/availability?username=morgan")))
        .status,
    ).toBe(401);
    expect(
      (
        await GET(
          new Request("https://qrk.localhost/api/usernames/availability?username=invalid-name", {
            headers: { authorization: "Bearer token" },
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await GET(
          new Request("https://qrk.localhost/api/usernames/availability?username=morgan", {
            headers: { origin: "https://other.example" },
          }),
        )
      ).status,
    ).toBe(403);
    mocks.verifyToken.mockRejectedValue(new Error("Invalid token"));
    expect(
      (
        await GET(
          new Request("https://qrk.localhost/api/usernames/availability?username=morgan", {
            headers: { authorization: "Bearer invalid" },
          }),
        )
      ).status,
    ).toBe(401);
    expect(mocks.executeServiceQuery).not.toHaveBeenCalled();
  });
  it("allows preflight only from the configured App origin", async () => {
    expect(
      (
        await OPTIONS(
          new Request("https://qrk.localhost/api/usernames/availability", {
            method: "OPTIONS",
            headers: { origin: "https://app.qrk.localhost" },
          }),
        )
      ).status,
    ).toBe(204);
    expect(
      (
        await OPTIONS(
          new Request("https://qrk.localhost/api/usernames/availability", {
            method: "OPTIONS",
            headers: { origin: "https://other.example" },
          }),
        )
      ).status,
    ).toBe(403);
  });
});

describe("username assignment", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.ZEROSPIN_API_URL = "https://zerospin.qrk.localhost";
    process.env.ZEROSPIN_SECRET_KEY = "test-only-secret";
    process.env.NEXT_PUBLIC_APP_ORIGIN = "https://app.qrk.localhost";
    process.env.CLERK_SECRET_KEY = "test-only-clerk-secret";
    mocks.verifyToken.mockResolvedValue({ sub: "account_one" });
    mocks.executeAggregateQuery.mockReturnValue(
      Effect.succeed({ id: "usr_one", clerkUserId: "account_one" }),
    );
    mocks.executeServiceCommand.mockReturnValue(
      Effect.succeed({
        result: { _tag: "Success", success: { status: "assigned", username: "morgan" } },
        finalizedAt: new Date(),
      }),
    );
  });
  it("derives ownership from authentication and returns the authoritative assignment result", async () => {
    const response = await POST(
      new Request("https://qrk.localhost/api/usernames/assignment", {
        method: "POST",
        headers: {
          origin: "https://app.qrk.localhost",
          authorization: "Bearer token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username: "morgan" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "assigned", username: "morgan" });
    expect(mocks.executeServiceCommand.mock.calls[0][1]).toEqual({
      contractName: "assignUsername",
      payload: { userId: "usr_one", aggregateId: "account_one", username: "morgan" },
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("refuses supplied ownership and leaves an unavailable outcome uncertain without resubmission", async () => {
    const forged = await POST(
      new Request("https://qrk.localhost/api/usernames/assignment", {
        method: "POST",
        headers: { authorization: "Bearer token" },
        body: JSON.stringify({ username: "morgan", userId: "usr_other" }),
      }),
    );
    expect(forged.status).toBe(400);
    expect(mocks.executeServiceCommand).not.toHaveBeenCalled();
    mocks.executeServiceCommand.mockReturnValue(Effect.fail(new Error("Disconnected")));
    const unavailable = await POST(
      new Request("https://qrk.localhost/api/usernames/assignment", {
        method: "POST",
        headers: { authorization: "Bearer token" },
        body: JSON.stringify({ username: "morgan" }),
      }),
    );
    expect(unavailable.status).toBe(503);
    expect(mocks.executeServiceCommand).toHaveBeenCalledTimes(1);
  });
});
