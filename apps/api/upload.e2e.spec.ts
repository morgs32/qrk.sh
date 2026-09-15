import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/backend", () => ({
  verifyToken: async (sessionToken: string) => {
    if (sessionToken === "invalid-token") {
      throw new Error("Invalid token");
    }
    return { sub: sessionToken };
  },
}));

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("POST /upload", () => {
  it("rejects missing authorization", async () => {
    const response = await SELF.fetch("https://api.invalid/upload", {
      method: "POST",
      headers: {
        Origin: "http://127.0.0.1:3001",
      },
      body: new FormData(),
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      code: "missing-authorization",
    });
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://127.0.0.1:3001",
    );
  });

  it("rejects invalid tokens", async () => {
    const formData = new FormData();
    formData.set(
      "file",
      new File([new Uint8Array([137, 80, 78, 71])], "logo.png", {
        type: "image/png",
      }),
    );

    const response = await SELF.fetch("https://api.invalid/upload", {
      method: "POST",
      headers: {
        Authorization: "Bearer invalid-token",
        Origin: "http://127.0.0.1:3001",
      },
      body: formData,
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      code: "invalid-token",
    });
  });

  it("stores an image in R2 and returns a public URL", async () => {
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const formData = new FormData();
    formData.set(
      "file",
      new File([bytes], "logo.png", {
        type: "image/png",
      }),
    );
    formData.set("siteId", "sit_upload_test");

    const response = await SELF.fetch("https://api.invalid/upload", {
      method: "POST",
      headers: {
        Authorization: "Bearer user_upload_test",
        Origin: "http://127.0.0.1:3001",
      },
      body: formData,
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      key: string;
      url: string;
      contentType: string;
    };
    expect(body.contentType).toBe("image/png");
    expect(body.key).toMatch(/^user_upload_test\/sit_upload_test\/.+\.png$/);
    expect(body.url).toBe(`https://api.invalid/assets/${body.key}`);

    const stored = await env.QRKSH.get(body.key);
    expect(stored).not.toBeNull();
    expect(stored?.httpMetadata?.contentType).toBe("image/png");
    const storedBytes = new Uint8Array((await stored!.arrayBuffer()) ?? new ArrayBuffer(0));
    expect(Array.from(storedBytes)).toEqual(Array.from(bytes));

    const assetResponse = await SELF.fetch(body.url, {
      method: "GET",
      headers: {
        Origin: "http://127.0.0.1:3001",
      },
    });
    expect(assetResponse.status).toBe(200);
    expect(assetResponse.headers.get("Content-Type")).toBe("image/png");
    const assetBytes = new Uint8Array(await assetResponse.arrayBuffer());
    expect(Array.from(assetBytes)).toEqual(Array.from(bytes));
  });

  it("answers CORS preflight", async () => {
    const response = await SELF.fetch("https://api.invalid/upload", {
      method: "OPTIONS",
      headers: {
        Origin: "http://127.0.0.1:3001",
        "Access-Control-Request-Method": "POST",
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://127.0.0.1:3001",
    );
  });
});

describe("GET /assets/*", () => {
  it("returns 404 for a missing key", async () => {
    const response = await SELF.fetch(
      "https://api.invalid/assets/user_missing/sit_missing/missing.png",
      {
        method: "GET",
        headers: {
          Origin: "http://127.0.0.1:3001",
        },
      },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      code: "not-found",
    });
  });
});
