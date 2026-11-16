import { beforeEach, describe, expect, it, vi } from "vitest";
import { Effect } from "effect";

const mocks = vi.hoisted(() => ({
  makeSystemSpec: vi.fn(),
  executeServiceQuery: vi.fn(),
  executeAggregateQuery: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@zerospin/core/utils/getSystemApi/getSystemApi", async () => {
  const { Effect } = await import("effect");
  return {
    getSystemApi: () =>
      Effect.succeed({
        makeSystemSpec: mocks.makeSystemSpec,
        executeServiceQuery: mocks.executeServiceQuery,
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
    mocks.executeServiceQuery.mockReturnValue(
      Effect.succeed({ siteId: "sit_one", userId: "usr_one", aggregateId: "user_123" }),
    );
    mocks.makeSystemSpec.mockReturnValue(
      Effect.succeed({
        services: { domains: { canonical: 1, releases: { 1: { models: { domain: 1 } } } } },
        aggregates: {
          user: {
            canonical: 1,
            releases: {
              1: {
                models: { user: 1, site: 2, page: 1, pageSnapshot: 1 },
              },
            },
          },
        },
      }),
    );
  });

  it("selects only the current published snapshot and public Site fields", async () => {
    const selections = [];
    mocks.executeAggregateQuery.mockImplementation(
      ({ aggregateName, aggregateVersion, aggregateId, query }) => {
        const read = query.prepareRead().request;
        selections.push({ aggregateName, aggregateVersion, aggregateId, read });
        if (read.modelName === "page") {
          return Effect.succeed([{ id: "pag_one", publishedSnapshotId: "psn_one" }]);
        }
        return Effect.succeed({
          content: {
            slug: "about/team",
            title: "Published",
            description: null,
            walls: [],
            bricks: [],
          },
          page: {
            id: "pag_one",
            site: {
              name: "My Site",
              brickGap: 4,
              cardStyle: false,
              stickyNavbar: true,
              faviconLightUrl: null,
              faviconDarkUrl: null,
            },
          },
        });
      },
    );

    const result = await readPublishedPage({
      host: "morgs32-a7b2c3",
      requestHost: "morgs32-a7b2c3.qrk.localhost:443",
      path: ["about", "team"],
    });
    expect(result?.snapshot.title).toBe("Published");
    const domainRead = mocks.executeServiceQuery.mock.calls[0][0];
    expect(domainRead).toMatchObject({ serviceName: "domains", serviceVersion: 1 });
    expect(domainRead.query.prepareRead().request.config.where).toEqual({
      hostname: { eq: "morgs32-a7b2c3" },
    });
    expect(selections).toHaveLength(2);
    expect(selections[0].read.config.where.site.hostname).toEqual({ eq: "morgs32-a7b2c3" });
    expect(selections[1]).toMatchObject({
      aggregateName: "user",
      aggregateVersion: 1,
      aggregateId: "user_123",
      read: {
        modelName: "pageSnapshot",
        config: {
          columns: { content: true },
          where: {
            id: { eq: "psn_one" },
            page: {
              id: { eq: "pag_one" },
              slug: { eq: "about/team" },
              isPublished: { eq: true },
              publishedSnapshotId: { eq: "psn_one" },
              site: {
                id: { eq: "sit_one" },
                hostname: { eq: "morgs32-a7b2c3" },
                isPublished: { eq: true },
                user: { id: { eq: "usr_one" }, clerkUserId: { eq: "user_123" } },
              },
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
    await expect(
      readPublishedPage({
        host: "morgs32-a7b2c3",
        requestHost: "morgs32-a7b2c3.qrk.localhost",
        path: undefined,
      }),
    ).resolves.toBeNull();
  });

  it("retries against the current pointer if a Page is republished between reads", async () => {
    mocks.executeAggregateQuery
      .mockReturnValueOnce(Effect.succeed([{ id: "pag_one", publishedSnapshotId: "psn_old" }]))
      .mockReturnValueOnce(Effect.succeed(undefined))
      .mockReturnValueOnce(Effect.succeed([{ id: "pag_one", publishedSnapshotId: "psn_new" }]))
      .mockReturnValueOnce(
        Effect.succeed({
          content: { slug: null, title: "New", description: null, walls: [], bricks: [] },
          page: {
            id: "pag_one",
            site: {
              name: "Site",
              brickGap: 0,
              cardStyle: false,
              stickyNavbar: true,
              faviconLightUrl: null,
              faviconDarkUrl: null,
            },
          },
        }),
      );
    const result = await readPublishedPage({
      host: "morgs32-a7b2c3",
      requestHost: "morgs32-a7b2c3.qrk.localhost",
      path: undefined,
    });
    expect(result?.snapshot.title).toBe("New");
    const lastRead = mocks.executeAggregateQuery.mock.calls[3][0].query.prepareRead().request;
    expect(lastRead.config.where.id).toEqual({ eq: "psn_new" });
    expect(lastRead.config.where.page.publishedSnapshotId).toEqual({ eq: "psn_new" });
  });

  it("rejects forged hosts and invalid paths without querying Domains", async () => {
    await expect(
      readPublishedPage({ host: "morgs32-a7b2c3", requestHost: "qrk.localhost", path: undefined }),
    ).resolves.toBeNull();
    await expect(
      readPublishedPage({
        host: "morgs32-a7b2c3",
        requestHost: "morgs32-a7b2c3.qrk.localhost",
        path: ["a/b"],
      }),
    ).resolves.toBeNull();
    expect(mocks.executeServiceQuery).not.toHaveBeenCalled();
  });

  it("returns unavailable for an unassigned hostname", async () => {
    mocks.executeServiceQuery.mockReturnValue(Effect.succeed(undefined));
    await expect(
      readPublishedPage({
        host: "morgs32-a7b2c3",
        requestHost: "morgs32-a7b2c3.qrk.localhost",
        path: undefined,
      }),
    ).resolves.toBeNull();
    expect(mocks.executeAggregateQuery).not.toHaveBeenCalled();
  });

  it("does not hide a Domains failure as a missing Page", async () => {
    mocks.executeServiceQuery.mockReturnValue(Effect.fail(new Error("Domains unavailable")));
    await expect(
      readPublishedPage({
        host: "morgs32-a7b2c3",
        requestHost: "morgs32-a7b2c3.qrk.localhost",
        path: undefined,
      }),
    ).rejects.toThrow("Domains unavailable");
  });

  it("rejects an incompatible canonical model graph before reading data", async () => {
    mocks.makeSystemSpec.mockReturnValue(
      Effect.succeed({
        services: { domains: { canonical: 1, releases: { 1: { models: { domain: 1 } } } } },
        aggregates: {
          user: {
            canonical: 2,
            releases: {
              2: {
                models: { user: 1, site: 1, page: 1, pageSnapshot: 2 },
              },
            },
          },
        },
      }),
    );
    await expect(
      readPublishedPage({
        host: "morgs32-a7b2c3",
        requestHost: "morgs32-a7b2c3.qrk.localhost",
        path: undefined,
      }),
    ).rejects.toThrow("canonical User models");
    expect(mocks.executeAggregateQuery).not.toHaveBeenCalled();
  });
});
