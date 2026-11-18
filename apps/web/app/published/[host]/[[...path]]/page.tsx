import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { isCreatorFileId, makeCreatorFileUrl } from "@qrk.sh/bricks/creatorFile/creatorFileId";
import { PublishedWalls } from "@/library/PublishedWalls";
import { readPublishedPage } from "@/library/readPublishedPage";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: {
  params: Promise<{ host: string; path?: string[] }>;
}): Promise<Metadata> {
  const { params } = props;
  if (process.env.NODE_ENV !== "development") notFound();
  const { host, path } = await params;
  const requestHost = (await headers()).get("host");
  const published = await readPublishedPage({ host, requestHost, path });
  if (published === null) notFound();
  const { snapshot, site } = published;
  return {
    title: snapshot.title ?? site.name,
    description: snapshot.description,
    icons: {
      icon: [
        ...(site.faviconLightUrl === null
          ? []
          : [{
            url: isCreatorFileId(site.faviconLightUrl) ? makeCreatorFileUrl(site.faviconLightUrl) : site.faviconLightUrl,
            media: "(prefers-color-scheme: light)",
          }]),
        ...(site.faviconDarkUrl === null
          ? []
          : [{
            url: isCreatorFileId(site.faviconDarkUrl) ? makeCreatorFileUrl(site.faviconDarkUrl) : site.faviconDarkUrl,
            media: "(prefers-color-scheme: dark)",
          }]),
      ],
    },
  };
}

export default async function PublishedPage(props: {
  params: Promise<{ host: string; path?: string[] }>;
}) {
  const { params } = props;
  if (process.env.NODE_ENV !== "development") notFound();
  const { host, path } = await params;
  const requestHost = (await headers()).get("host");
  const published = await readPublishedPage({ host, requestHost, path });
  if (published === null) notFound();
  const { snapshot, site } = published;
  return (
    <>
      <header className={site.stickyNavbar ? "sticky top-0 z-50 bg-background" : "bg-background"}>
        <div className="mx-auto flex min-h-16 max-w-[1440px] items-center px-4 font-medium">
          {site.name}
        </div>
      </header>
      <main>
        <PublishedWalls snapshot={snapshot} brickGap={site.brickGap} cardStyle={site.cardStyle} />
      </main>
    </>
  );
}
