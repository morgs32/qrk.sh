import { useLiveQuery } from "@zerospin/react";
import { makeIdSchema } from "@zerospin/sdk/browser";
import { Schema } from "effect";
import { siteV1 } from "@qrk.sh/zerospin/src/aggregates/user/models/site/SiteV1";

import { SiteSettings } from "@/app/[username]/site/[siteId]/page/[pageId]/SiteSettings/SiteSettings";
import NotFound from "@/app/not-found";
import { useValidatedParams } from "@/hooks/useValidatedParams";
import { UserUI } from "@/zerospin/UserUI";

const ParamsSchema = Schema.Struct({ siteId: makeIdSchema(siteV1) });

export default function Page() {
  const { siteId } = useValidatedParams(ParamsSchema);
  const session = UserUI.useSession();
  const { data: site } = useLiveQuery({
    session,
    key: siteId,
    query: (db, id) => db.query.site.findFirst({ where: { id: { eq: id } } }),
  });
  if (site === undefined) return <NotFound />;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <SiteSettings
        key={site.id}
        site={{
          id: site.id,
          name: site.name ?? "",
          description: site.description ?? "",
          logoUrl: site.logoUrl ?? "",
          faviconLightUrl: site.faviconLightUrl ?? "",
          faviconDarkUrl: site.faviconDarkUrl ?? "",
          cardStyle: site.cardStyle,
          stickyNavbar: site.stickyNavbar,
          isPublished: site.isPublished,
        }}
      />
    </div>
  );
}
