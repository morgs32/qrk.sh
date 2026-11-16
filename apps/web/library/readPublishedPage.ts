import "server-only";

import { SecretKey } from "@zerospin/core/services/SecretKey";
import { getSystemApi } from "@zerospin/core/utils/getSystemApi/getSystemApi";
import { makeQueryDbVersion, ZerospinApiUrl } from "@zerospin/sdk";
import { pageV1 } from "@qrk.sh/bricks/zerospin/models/page/PageV1";
import { pageSnapshotV1 } from "@qrk.sh/bricks/zerospin/models/pageSnapshot/PageSnapshotV1";
import { siteV2 } from "@qrk.sh/bricks/zerospin/models/site/SiteV2";
import { userV1 } from "@qrk.sh/bricks/zerospin/models/user/UserV1";
import { domainV1 } from "@qrk.sh/zerospin/src/services/domains/DomainV1";
import { Effect, Layer, Redacted, Schedule } from "effect";

const db = makeQueryDbVersion({
  models: { user: userV1, site: siteV2, page: pageV1, pageSnapshot: pageSnapshotV1 },
});
const domainsDb = makeQueryDbVersion({ models: { domain: domainV1 } });
const userAggregateVersion = 4;

export async function readPublishedPage(props: {
  host: string;
  requestHost: string | null;
  path: string[] | undefined;
}) {
  const { host, requestHost, path } = props;
  const label = host.toLowerCase();
  if (
    host !== label ||
    requestHost?.toLowerCase().replace(/:\d+$/, "") !== `${label}.qrk.localhost` ||
    !/^[a-z0-9]{1,56}-[a-z0-9]{6}$/.test(label) ||
    path?.some(
      (segment) =>
        segment.length === 0 || segment === "." || segment === ".." || /[\\/]/.test(segment),
    )
  ) {
    return null;
  }
  const pageSlug = path === undefined || path.length === 0 ? null : path.join("/");
  const secret = process.env.ZEROSPIN_SECRET_KEY;
  const endpoint = process.env.ZEROSPIN_API_URL;
  if (!secret || !endpoint) throw new Error("The published-page System API is not configured");

  return Effect.runPromise(
    Effect.gen(function* () {
      const api = yield* getSystemApi();
      const spec = yield* api.makeSystemSpec();
      const domains = spec.services.domains;
      const domainRelease = domains?.releases[String(domains.canonical)];
      if (domains === undefined || domainRelease?.models.domain !== domainV1.version) {
        throw new Error("The canonical Domains model does not match the published-page reader");
      }
      const assignment = yield* api.executeServiceQuery({
        serviceName: "domains",
        serviceVersion: domains.canonical,
        query: domainsDb.query.domain.findFirst({
          columns: { siteId: true, userId: true, aggregateId: true },
          where: { hostname: { eq: label } },
        }),
      });
      if (assignment === undefined) return null;
      const owner = spec.aggregates.user;
      if (owner === undefined) throw new Error("The User aggregate is not registered");
      const release = owner.releases[String(userAggregateVersion)];
      if (
        release === undefined ||
        release.models.user !== userV1.version ||
        release.models.site !== siteV2.version ||
        release.models.page !== pageV1.version ||
        release.models.pageSnapshot !== pageSnapshotV1.version
      ) {
        throw new Error("The User V4 models do not match the published-page reader");
      }
      const published = yield* Effect.gen(function* () {
        const pages = yield* api.executeAggregateQuery({
          aggregateName: "user",
          aggregateVersion: userAggregateVersion,
          aggregateId: assignment.aggregateId,
          query: db.query.page.findMany({
            columns: { id: true, publishedSnapshotId: true },
            where: {
              slug: pageSlug === null ? { isNull: true } : { eq: pageSlug },
              isPublished: { eq: true },
              site: {
                id: { eq: assignment.siteId },
                hostname: { eq: label },
                isPublished: { eq: true },
                user: {
                  id: { eq: assignment.userId },
                  clerkUserId: { eq: assignment.aggregateId },
                },
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
          aggregateVersion: userAggregateVersion,
          aggregateId: assignment.aggregateId,
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
                  id: { eq: assignment.siteId },
                  hostname: { eq: label },
                  isPublished: { eq: true },
                  user: {
                    id: { eq: assignment.userId },
                    clerkUserId: { eq: assignment.aggregateId },
                  },
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
        return undefined;
      }).pipe(
        Effect.repeat({ schedule: Schedule.recurs(1), while: (result) => result === undefined }),
      );
      if (published === undefined)
        throw new Error("Published Page changed while it was being read");
      return published;
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
