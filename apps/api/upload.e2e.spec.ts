import { env, SELF } from "cloudflare:test";
import { Schema } from "effect";
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
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://127.0.0.1:3001");
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

  it.each(["http://127.0.0.1:3001", "http://localhost:3000"])(
    "answers CORS preflight for %s",
    async (origin) => {
      const response = await SELF.fetch("https://api.invalid/upload", {
        method: "OPTIONS",
        headers: {
          Origin: origin,
          "Access-Control-Request-Method": "POST",
        },
      });

      expect(response.status).toBe(204);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    },
  );
});

describe("POST /image/upload", () => {
  it("stores an anonymous image in QRKSH and serves its public URL", async () => {
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const formData = new FormData();
    formData.set("file", new File([bytes], "photo.png", { type: "image/png" }));

    const response = await SELF.fetch("https://api.invalid/image/upload", {
      method: "POST",
      headers: { Origin: "http://127.0.0.1:4100" },
      body: formData,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://127.0.0.1:4100");
    const body = Schema.decodeUnknownSync(
      Schema.Struct({ key: Schema.String, url: Schema.String, contentType: Schema.String }),
    )(await response.json());
    expect(body.contentType).toBe("image/png");
    expect(body.key).toMatch(/^image\/_\/.+\.png$/);
    expect(body.url).toBe(`https://api.invalid/assets/${body.key}`);

    const stored = await env.QRKSH.get(body.key);
    expect(stored).not.toBeNull();
    if (stored === null) {
      throw new Error("Uploaded image is missing from QRKSH");
    }
    expect(stored.httpMetadata?.contentType).toBe("image/png");
    expect(new Uint8Array(await stored.arrayBuffer())).toEqual(bytes);
    expect(await env.ASSETS.get(body.key)).toBeNull();

    const assetResponse = await SELF.fetch(body.url, {
      headers: { Origin: "http://127.0.0.1:4100" },
    });
    expect(assetResponse.status).toBe(200);
    expect(assetResponse.headers.get("Content-Type")).toBe("image/png");
    expect(new Uint8Array(await assetResponse.arrayBuffer())).toEqual(bytes);
  });

  it("rejects a non-multipart request", async () => {
    const response = await SELF.fetch("https://api.invalid/image/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file: "photo.png" }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "invalid-content-type" });
  });

  it.each([
    { name: "missing file", code: "missing-file", file: undefined },
    { name: "string file field", code: "missing-file", file: "photo.png" },
    {
      name: "empty image",
      code: "empty-file",
      file: new File([], "photo.png", { type: "image/png" }),
    },
    {
      name: "unsupported media type",
      code: "unsupported-media-type",
      file: new File(["GIF89a"], "photo.gif", { type: "image/gif" }),
    },
    {
      name: "image over 5 MiB",
      code: "file-too-large",
      file: new File([new Uint8Array(5 * 1024 * 1024 + 1)], "photo.png", {
        type: "image/png",
      }),
    },
  ])("rejects $name", async (props) => {
    const { code, file } = props;
    const formData = new FormData();
    if (file !== undefined) {
      formData.set("file", file);
    }
    const response = await SELF.fetch("https://api.invalid/image/upload", {
      method: "POST",
      body: formData,
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code });
  });

  it("retains siteId validation", async () => {
    const formData = new FormData();
    formData.set("file", new File(["photo"], "photo.png", { type: "image/png" }));
    formData.set("siteId", "invalid-site");
    const response = await SELF.fetch("https://api.invalid/image/upload", {
      method: "POST",
      body: formData,
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "invalid-site-id" });
  });

  it("answers Library CORS preflight", async () => {
    const response = await SELF.fetch("https://api.invalid/image/upload", {
      method: "OPTIONS",
      headers: {
        Origin: "http://127.0.0.1:4100",
        "Access-Control-Request-Method": "POST",
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://127.0.0.1:4100");
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain("POST");
  });
});

it.each(["/upload", "/image/upload"])("rejects GET %s", async (path) => {
  const response = await SELF.fetch(`https://api.invalid${path}`);

  expect(response.status).toBe(405);
  expect(await response.json()).toEqual({
    code: "method-not-allowed",
    message: `Use POST ${path}`,
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
