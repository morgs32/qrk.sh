import { upgradeAggregateContractVersion, primitives } from "@zerospin/sdk/browser";
import { Effect } from "effect";
import { siteV3 as Site } from "../../models/site/SiteV3";

import { updateSiteSettingsV2 } from "./UpdateSiteSettingsV2";

export const updateSiteSettingsV3 = upgradeAggregateContractVersion(updateSiteSettingsV2, {
  operations: { updateSite: Site.operations.update },
  payload: {
    cardStyle: primitives.boolean({ defaultValue: false }),
    stickyNavbar: primitives.boolean({ defaultValue: true }),
  },
  up: Effect.fn("updateSiteSettingsV3.up")(function* (props) {
    const { payload } = props;
    return { ...payload, cardStyle: false, stickyNavbar: true };
  }),
  down: Effect.fn("updateSiteSettingsV3.down")(function* (props) {
    const { payload } = props;
    const { cardStyle, stickyNavbar, ...previous } = payload;
    void cardStyle;
    void stickyNavbar;
    return previous;
  }),
  models: { site: Site },
  program: Effect.fn("updateSiteSettingsV3")(function* (props) {
    const { operations, payload } = props;
    yield* operations.updateSite({
      resourceId: payload.id,
      attributes: {
        name: payload.name,
        description: payload.description,
        logoUrl: payload.logoUrl,
        faviconLightUrl: payload.faviconLightUrl,
        faviconDarkUrl: payload.faviconDarkUrl,
        cardStyle: payload.cardStyle,
        stickyNavbar: payload.stickyNavbar,
      },
    });
  }),
  version: "3.0.0",
});
