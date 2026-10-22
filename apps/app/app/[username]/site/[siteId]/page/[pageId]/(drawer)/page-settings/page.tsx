import { useLiveQuery } from "@zerospin/react";
import { makeIdSchema } from "@zerospin/sdk/browser";
import { Schema } from "effect";
import { pageV1 } from "@qrk.sh/zerospin/src/aggregates/user/models/page/PageV1";
import { siteV1 } from "@qrk.sh/zerospin/src/aggregates/user/models/site/SiteV1";

import { PageSettings } from "@/app/[username]/site/[siteId]/page/[pageId]/PageSettings/PageSettings";
import NotFound from "@/app/not-found";
import { useValidatedParams } from "@/hooks/useValidatedParams";
import { UserUI } from "@/zerospin/UserUI";

const ParamsSchema = Schema.Struct({ siteId: makeIdSchema(siteV1), pageId: makeIdSchema(pageV1) });

export default function Page() {
  const { siteId, pageId } = useValidatedParams(ParamsSchema);
  const session = UserUI.useSession();
  const { data: page } = useLiveQuery({
    session,
    key: { siteId, pageId },
    query: (db, { siteId, pageId }) => db.query.page.findFirst({
      where: { id: { eq: pageId }, siteId: { eq: siteId } },
    }),
  });
  if (page === undefined) return <NotFound />;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <PageSettings
        key={page.id}
        page={{ id: page.id, title: page.title ?? "", description: page.description ?? "" }}
      />
    </div>
  );
}
