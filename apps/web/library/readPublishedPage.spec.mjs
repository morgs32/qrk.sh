import { beforeEach, describe, expect, it, vi } from "vitest";
import { Effect } from "effect";

const mocks = vi.hoisted(() => ({
  getUserList: vi.fn(),
  makeSystemSpec: vi.fn(),
  executeAggregateQuery: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({ users: { getUserList: mocks.getUserList } }),
}));
vi.mock("@zerospin/core/utils/getSystemApi/getSystemApi", async () => {
  const { Effect } = await import("effect");
  return {
    getSystemApi: () => Effect.succeed({
      makeSystemSpec: mocks.makeSystemSpec,
      executeAggregateQuery: mocks.executeAggregateQuery,
    }),
  };
});

import { readPublishedPage } from "./readPublishedPage";

describe("readPublishedPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.ZEROSPIN_API_URL = "https://zerospin.qrk.localhost";
    process.env.ZEROSPIN_SECRET_KEY = "test-only-secret";
    mocks.getUserList.mockResolvedValue({
      totalCount: 1,
      data: [{ id: "user_123", username: "morgs32" }],
    });
    mocks.makeSystemSpec.mockReturnValue(Effect.succeed({
      aggregates: { user: { canonical: 1, releases: { 1: {
        models: { user: 1, site: 1, page: 1, pageSnapshot: 1 },
      } } } },
    }));
  });

  it("selects only the current published snapshot and public Site fields", async () => {
    const selections = [];
    mocks.executeAggregateQuery.mockImplementation(({ aggregateName, aggregateVersion, aggregateId, query }) => {
      const read = query.prepareRead().request;
      selections.push({ aggregateName, aggregateVersion, aggregateId, read });
      if (read.modelName === "page") {
        return Effect.succeed([{ id: "pag_one", publishedSnapshotId: "psn_one" }]);
      }
      return Effect.succeed({
        content: { slug: "about/team", title: "Published", description: null, walls: [], bricks: [] },
        page: { id: "pag_one", site: { name: "My Site", brickGap: 4, cardStyle: false, stickyNavbar: true, faviconLightUrl: null, faviconDarkUrl: null } },
      });
    });

    const result = await readPublishedPage({
      host: "my-site-morgs32", requestHost: "my-site-morgs32.qrk.localhost:443", path: ["about", "team"],
    });
    expect(result?.snapshot.title).toBe("Published");
    expect(mocks.getUserList).toHaveBeenCalledWith({ username: ["morgs32"], limit: 2 });
    expect(selections).toHaveLength(2);
    expect(selections[1]).toMatchObject({
      aggregateName: "user", aggregateVersion: 1, aggregateId: "user_123",
      read: {
        modelName: "pageSnapshot",
        config: {
          columns: { content: true },
          where: {
            id: { eq: "psn_one" },
            page: {
              id: { eq: "pag_one" }, slug: { eq: "about/team" }, isPublished: { eq: true },
              publishedSnapshotId: { eq: "psn_one" },
              site: { slug: { eq: "my-site" }, isPublished: { eq: true }, user: { clerkUserId: { eq: "user_123" } } },
            },
          },
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain("test-only-secret");
  });

  it("returns unavailable if unpublication commits between reads", async () => {
    mocks.executeAggregateQuery
      .mockReturnValueOnce(Effect.succeed([{ id: "pag_one", publishedSnapshotId: "psn_one" }]))
      .mockReturnValueOnce(Effect.succeed(undefined))
      .mockReturnValueOnce(Effect.succeed([]));
    await expect(readPublishedPage({ host: "site-morgs32", requestHost: "site-morgs32.qrk.localhost", path: undefined })).resolves.toBeNull();
  });

  it("retries against the current pointer if a Page is republished between reads", async () => {
    mocks.executeAggregateQuery
      .mockReturnValueOnce(Effect.succeed([{ id: "pag_one", publishedSnapshotId: "psn_old" }]))
      .mockReturnValueOnce(Effect.succeed(undefined))
      .mockReturnValueOnce(Effect.succeed([{ id: "pag_one", publishedSnapshotId: "psn_new" }]))
      .mockReturnValueOnce(Effect.succeed({
        content: { slug: null, title: "New", description: null, walls: [], bricks: [] },
        page: { id: "pag_one", site: { name: "Site", brickGap: 0, cardStyle: false, stickyNavbar: true, faviconLightUrl: null, faviconDarkUrl: null } },
      }));
    const result = await readPublishedPage({ host: "site-morgs32", requestHost: "site-morgs32.qrk.localhost", path: undefined });
    expect(result?.snapshot.title).toBe("New");
    const lastRead = mocks.executeAggregateQuery.mock.calls[3][0].query.prepareRead().request;
    expect(lastRead.config.where.id).toEqual({ eq: "psn_new" });
    expect(lastRead.config.where.page.publishedSnapshotId).toEqual({ eq: "psn_new" });
  });

  it("rejects forged hosts and invalid paths without looking up users", async () => {
    await expect(readPublishedPage({ host: "site-morgs32", requestHost: "qrk.localhost", path: undefined })).resolves.toBeNull();
    await expect(readPublishedPage({ host: "site-morgs32", requestHost: "site-morgs32.qrk.localhost", path: ["a/b"] })).resolves.toBeNull();
    expect(mocks.getUserList).not.toHaveBeenCalled();
  });

  it("fails on ambiguous identities rather than exposing a different user's data", async () => {
    mocks.getUserList.mockResolvedValue({ totalCount: 2, data: [{ id: "user_1", username: "morgs32" }, { id: "user_2", username: "morgs32" }] });
    await expect(readPublishedPage({ host: "site-morgs32", requestHost: "site-morgs32.qrk.localhost", path: undefined })).rejects.toThrow("ambiguous username");
    expect(mocks.executeAggregateQuery).not.toHaveBeenCalled();
  });

  it("does not hide a Clerk failure as a missing Page", async () => {
    mocks.getUserList.mockRejectedValue(new Error("Clerk unavailable"));
    await expect(readPublishedPage({ host: "site-morgs32", requestHost: "site-morgs32.qrk.localhost", path: undefined })).rejects.toThrow("Clerk unavailable");
  });

  it("rejects an incompatible canonical model graph before reading data", async () => {
    mocks.makeSystemSpec.mockReturnValue(Effect.succeed({
      aggregates: { user: { canonical: 2, releases: { 2: {
        models: { user: 1, site: 1, page: 1, pageSnapshot: 2 },
      } } } },
    }));
    await expect(readPublishedPage({ host: "site-morgs32", requestHost: "site-morgs32.qrk.localhost", path: undefined })).rejects.toThrow("canonical User models");
    expect(mocks.executeAggregateQuery).not.toHaveBeenCalled();
  });
});
