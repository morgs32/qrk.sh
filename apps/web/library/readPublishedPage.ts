import "server-only";

import { clerkClient } from "@clerk/nextjs/server";
import { SecretKey } from "@zerospin/core/services/SecretKey";
import { getSystemApi } from "@zerospin/core/utils/getSystemApi/getSystemApi";
import { makeQueryDbVersion, ZerospinApiUrl } from "@zerospin/sdk";
import { pageV1 } from "@qrk.sh/bricks/zerospin/models/page/PageV1";
import { pageSnapshotV1 } from "@qrk.sh/bricks/zerospin/models/pageSnapshot/PageSnapshotV1";
import { siteV1 } from "@qrk.sh/bricks/zerospin/models/site/SiteV1";
import { userV1 } from "@qrk.sh/bricks/zerospin/models/user/UserV1";
import { Effect, Layer, Redacted } from "effect";

const db = makeQueryDbVersion({
  models: { user: userV1, site: siteV1, page: pageV1, pageSnapshot: pageSnapshotV1 },
});

export async function readPublishedPage(props: {
  host: string;
  requestHost: string | null;
  path: string[] | undefined;
}) {
  const { host, requestHost, path } = props;
  const label = host.toLowerCase();
  const separator = label.lastIndexOf("-");
  const siteSlug = label.slice(0, separator);
  const username = label.slice(separator + 1);
  if (
    host !== label ||
    requestHost?.toLowerCase().replace(/:\d+$/, "") !== `${label}.qrk.localhost` ||
    label.length > 63 ||
    separator < 1 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(siteSlug) ||
    !/^[a-z0-9]+$/.test(username) ||
    path?.some((segment) =>
      segment.length === 0 || segment === "." || segment === ".." || /[\\/]/.test(segment),
    )
  ) {
    return null;
  }
  const pageSlug = path === undefined || path.length === 0 ? null : path.join("/");
  const clerk = await clerkClient();
  const users = await clerk.users.getUserList({ username: [username], limit: 2 });
  if (users.totalCount === 0) return null;
  if (users.totalCount !== 1 || users.data.length !== 1) {
    throw new Error("Clerk returned an ambiguous username");
  }
  const user = users.data[0];
  if (user.username?.toLowerCase() !== username) {
    throw new Error("Clerk returned an unexpected username");
  }

  const secret = process.env.ZEROSPIN_SECRET_KEY;
  const endpoint = process.env.ZEROSPIN_API_URL;
  if (!secret || !endpoint) throw new Error("The published-page System API is not configured");

  return Effect.runPromise(
    Effect.gen(function* () {
      const api = yield* getSystemApi();
      const spec = yield* api.makeSystemSpec();
      const owner = spec.aggregates.user;
      if (owner === undefined) throw new Error("The User aggregate is not registered");
      const release = owner.releases[String(owner.canonical)];
      if (
        release === undefined ||
        release.models.user !== userV1.version ||
        release.models.site !== siteV1.version ||
        release.models.page !== pageV1.version ||
        release.models.pageSnapshot !== pageSnapshotV1.version
      ) {
        throw new Error("The canonical User models do not match the published-page reader");
      }
      for (let attempt = 0; attempt < 2; attempt++) {
        const pages = yield* api.executeAggregateQuery({
          aggregateName: "user",
          aggregateVersion: owner.canonical,
          aggregateId: user.id,
          query: db.query.page.findMany({
            columns: { id: true, publishedSnapshotId: true },
            where: {
              slug: pageSlug === null ? { isNull: true } : { eq: pageSlug },
              isPublished: { eq: true },
              site: {
                slug: { eq: siteSlug },
                isPublished: { eq: true },
                user: { clerkUserId: { eq: user.id } },
              },
            },
          }),
        });
        if (pages.length === 0) return null;
        if (pages.length !== 1) throw new Error("Published Page path is ambiguous");
        const page = pages[0];
        const snapshotId = page.publishedSnapshotId;
        if (snapshotId === null) throw new Error("Published Page has no current snapshot");
        const snapshot = yield* api.executeAggregateQuery({
          aggregateName: "user",
          aggregateVersion: owner.canonical,
          aggregateId: user.id,
          query: db.query.pageSnapshot.findFirst({
            columns: { content: true },
            where: {
              id: { eq: snapshotId },
              page: {
                id: { eq: page.id },
                slug: pageSlug === null ? { isNull: true } : { eq: pageSlug },
                isPublished: { eq: true },
                publishedSnapshotId: { eq: snapshotId },
                site: {
                  slug: { eq: siteSlug },
                  isPublished: { eq: true },
                  user: { clerkUserId: { eq: user.id } },
                },
              },
            },
            with: {
              page: {
                columns: { id: true },
                with: {
                  site: {
                    columns: {
                      name: true,
                      stickyNavbar: true,
                      brickGap: true,
                      cardStyle: true,
                      faviconLightUrl: true,
                      faviconDarkUrl: true,
                    },
                  },
                },
              },
            },
          }),
        });
        if (snapshot !== undefined) {
          const site = snapshot.page?.site;
          if (site == null || snapshot.content.slug !== pageSlug) {
            throw new Error("Published snapshot does not match its Page");
          }
          return { site, snapshot: snapshot.content };
        }
      }
      throw new Error("Published Page changed while it was being read");
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(ZerospinApiUrl, endpoint),
          Layer.succeed(SecretKey, Redacted.make(secret)),
        ),
      ),
    ),
  );
}
