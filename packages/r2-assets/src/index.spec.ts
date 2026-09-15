import { describe, expect, it } from "vitest";

import { isR2AssetPath, makePublicObjectUrl } from "./index";

describe("isR2AssetPath", () => {
  it("accepts paths under /assets/ with a key", () => {
    expect(isR2AssetPath("/assets/user/sit_x/file.png")).toBe(true);
  });

  it("rejects the bare prefix and unrelated paths", () => {
    expect(isR2AssetPath("/assets/")).toBe(false);
    expect(isR2AssetPath("/assets")).toBe(false);
    expect(isR2AssetPath("/upload")).toBe(false);
  });
});

describe("makePublicObjectUrl", () => {
  it("resolves a path-absolute base against the request origin", () => {
    const request = new Request("https://api.invalid/upload");
    expect(
      makePublicObjectUrl({
        request,
        publicBaseUrl: "/assets",
        key: "user/sit_x/file.png",
      }),
    ).toBe("https://api.invalid/assets/user/sit_x/file.png");
  });

  it("keeps an absolute public base", () => {
    const request = new Request("https://api.invalid/upload");
    expect(
      makePublicObjectUrl({
        request,
        publicBaseUrl: "https://pub.example.r2.dev",
        key: "user/sit_x/file.png",
      }),
    ).toBe("https://pub.example.r2.dev/user/sit_x/file.png");
  });

  it("strips a trailing slash from the public base", () => {
    const request = new Request("https://api.invalid/upload");
    expect(
      makePublicObjectUrl({
        request,
        publicBaseUrl: "https://pub.example.r2.dev/",
        key: "a.png",
      }),
    ).toBe("https://pub.example.r2.dev/a.png");
  });
});
