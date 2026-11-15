import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";

const mocks = vi.hoisted(() => ({ clerkProxy: vi.fn(() => new Response(null, { status: 202 })) }));
vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware: () => mocks.clerkProxy,
  createRouteMatcher: () => () => false,
}));
import proxy, { config } from "./proxy";

describe("local published hostname routing", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("rewrites a valid host and nested path without caching", () => {
    vi.stubEnv("NODE_ENV", "development");
    const request = new NextRequest("https://qrk.localhost/about/team?from=link", {
      headers: { host: "my-site-morgs32.qrk.localhost:443" },
    });
    const response = proxy(request, undefined);
    const destination = new URL(response.headers.get("x-middleware-rewrite"));
    expect(destination.pathname).toBe("/published/my-site-morgs32/about/team");
    expect(destination.search).toBe("?from=link");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects malformed public labels and keeps infrastructure paths on their existing route", () => {
    vi.stubEnv("NODE_ENV", "development");
    const invalid = new NextRequest("https://qrk.localhost/", { headers: { host: "invalid.qrk.localhost" } });
    expect(proxy(invalid, undefined).status).toBe(404);
    const api = new NextRequest("https://qrk.localhost/api/rpc", { headers: { host: "site-user.qrk.localhost" } });
    expect(proxy(api, undefined).status).toBe(202);
    expect(mocks.clerkProxy).toHaveBeenCalledOnce();
  });

  it("routes file-like Page paths on Site hosts without intercepting base-host assets", () => {
    expect(unstable_doesMiddlewareMatch({
      config, nextConfig: {}, url: "/about.html", headers: { host: "my-site-morgs32.qrk.localhost" },
    })).toBe(true);
    expect(unstable_doesMiddlewareMatch({
      config, nextConfig: {}, url: "/about.html", headers: { host: "qrk.localhost" },
    })).toBe(false);
  });
});
