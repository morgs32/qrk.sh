import { page as pageIdentity } from "../../models/page/page";
import { ContractError } from "@zerospin/error";
import * as sdk from "@zerospin/sdk/browser";

import { modelId, makeAggregateContractVersion, primitives } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { pageV1 as Page } from "../../models/page/PageV1";
import { siteV1 as Site } from "../../models/site/SiteV1";
import { userV1 as User } from "../../models/user/UserV1";

import { updatePageSettings } from "./updatePageSettings";

const updatePageSettingsPayload = {
  id: modelId({ model: pageIdentity }),
  title: primitives.text({
    nullable: true,
    defaultValue: null,
  }),
  description: primitives.text({
    nullable: true,
    defaultValue: null,
  }),
};

export const updatePageSettingsV1 = makeAggregateContractVersion(updatePageSettings, {
  operations: { updatePage: Page.operations.update },
  failures: {
    updatePageSettingsUserMismatch: ContractError.schema({
      code: "update-page-settings-user-mismatch",
    }),
    updatePageSettingsNotFound: ContractError.schema({ code: "update-page-settings-not-found" }),
    updatePageSettingsSiteNotFound: ContractError.schema({
      code: "update-page-settings-site-not-found",
    }),
  },

  payload: updatePageSettingsPayload,
  models: { user: User, site: Site, page: Page },
  guard: (props) => {
    const { failures, claims, db, payload } = props;
    return Effect.gen(function* () {
      const clerkUserId = claims?.clerkUserId;

      if (typeof clerkUserId !== "string") {
        return yield* failures.updatePageSettingsUserMismatch.make({
          message: "Updating page settings requires an authenticated user",
          status: 403,
        });
      }

      const page = yield* sdk.findFirst({ db, model: db.models.page, where: { id: { eq: payload.id } } });

      if (page === undefined) {
        return yield* failures.updatePageSettingsNotFound.make({
          message: `Page ${payload.id} was not found`,
          status: 404,
        });
      }

      if (page.siteId === null) {
        return yield* failures.updatePageSettingsSiteNotFound.make({
          message: `Page ${payload.id} has no site`,
          status: 404,
        });
      }

      const site = yield* sdk.findFirst({ db, model: db.models.site, where: { id: { eq: page.siteId } } });

      if (site === undefined) {
        return yield* failures.updatePageSettingsSiteNotFound.make({
          message: `Site ${page.siteId} was not found`,
          status: 404,
        });
      }

      const user =
        site.userId === null
          ? undefined
          : yield* sdk.findFirst({ db, model: db.models.user, where: { id: { eq: site.userId } } });

      if (user === undefined || user.clerkUserId !== clerkUserId) {
        return yield* failures.updatePageSettingsUserMismatch.make({
          message: `Page ${payload.id} does not belong to identity ${clerkUserId}`,
          status: 403,
        });
      }
    });
  },
  program: (props) => {
    const { operations, payload } = props;
    return Effect.gen(function* () {
      yield* operations.updatePage({
        resourceId: payload.id,
        attributes: {
          title: payload.title,
          description: payload.description,
        },
      });
    });
  },
  version: "1.0.0",
});
