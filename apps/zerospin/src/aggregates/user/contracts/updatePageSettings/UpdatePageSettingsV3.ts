import * as sdk from "@zerospin/sdk/browser";

import { upgradeAggregateContractVersion } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { pageV3 as Page } from "../../models/page/PageV3";
import { siteV3 as Site } from "../../models/site/SiteV3";
import { userV1 as User } from "../../models/user/UserV1";

import { updatePageSettingsV2 } from "./UpdatePageSettingsV2";

export const updatePageSettingsV3 = upgradeAggregateContractVersion(updatePageSettingsV2, {
  operations: { updatePage: Page.operations.update },
  payload: {},
  up: Effect.fn("updatePageSettingsV3.up")(function* (props) {
    const { payload } = props;
    return payload;
  }),
  down: Effect.fn("updatePageSettingsV3.down")(function* (props) {
    const { payload } = props;
    return payload;
  }),
  models: { user: User, site: Site, page: Page },
  guard: Effect.fn("updatePageSettingsV3.guard")(function* (props) {
    const { failures, claims, db, payload } = props;
    const clerkUserId = claims?.clerkUserId;

    if (typeof clerkUserId !== "string") {
      return yield* failures.updatePageSettingsUserMismatch.make({
        message: "Updating page settings requires an authenticated user",
        status: 403,
      });
    }

    const page = yield* sdk.findFirst({ db, model: Page, where: { id: { eq: payload.id } } });

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

    const site = yield* sdk.findFirst({ db, model: Site, where: { id: { eq: page.siteId } } });

    if (site === undefined) {
      return yield* failures.updatePageSettingsSiteNotFound.make({
        message: `Site ${page.siteId} was not found`,
        status: 404,
      });
    }

    const user =
      site.userId === null
        ? undefined
        : yield* sdk.findFirst({ db, model: User, where: { id: { eq: site.userId } } });

    if (user === undefined || user.clerkUserId !== clerkUserId) {
      return yield* failures.updatePageSettingsUserMismatch.make({
        message: `Page ${payload.id} does not belong to identity ${clerkUserId}`,
        status: 403,
      });
    }
  }),
  program: Effect.fn("updatePageSettingsV3")(function* (props) {
    const { operations, payload } = props;
    yield* operations.updatePage({
      resourceId: payload.id,
      attributes: {
        title: payload.title,
        description: payload.description,
      },
    });
  }),
  version: "3.0.0",
});
