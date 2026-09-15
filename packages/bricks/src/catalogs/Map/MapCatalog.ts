import { createElement } from "react";
import { makeFetcherConfiguration } from "../../makeFetcherConfiguration";
import { primitives } from "@zerospin/schema";

import { makeView } from "../../makeView";
import { makeCatalog } from "../../makeCatalog";
import { makeContent } from "../../makeContent";
import { GooglePlaceLookup } from "./GooglePlaceLookup";
import { MapPlace4x4 } from "./MapPlace4x4";

export const mapCatalog = makeCatalog({
  catalogName: "map",
  catalogLabel: "Map",
  catalogDescription: "Interactive maps centered on a selected Google place.",
  contents: {
    place: makeContent({
      content: "place",
      contentName: "Place",
      contentDescription: "A map centered on one selected place.",
      configuration: makeFetcherConfiguration({
        contentOptionsShape: {
          googlePlaceId: primitives.text({ defaultValue: "ChIJ7cv00DwsDogRAMDACa2m4K8" }),
        },
        contentOptionsForm: ({ value, onChange }) =>
          createElement(GooglePlaceLookup, {
            value: value.googlePlaceId,
            onChange: (googlePlaceId) => onChange({ googlePlaceId }),
          }),
        fetcher: async ({ api, contentOptions, setData }) => {
          const result = await api.googlePlacesRepo().getPlace(contentOptions.googlePlaceId);
          if (result._tag === "Left") return result;
          setData(result.right);
          return { _tag: "Right", right: undefined };
        },
      }),
      dataShape: {
        googlePlaceId: primitives.text(),
        name: primitives.text(),
        address: primitives.text(),
        latitude: primitives.number(),
        longitude: primitives.number(),
      },
      defaultData: {
        googlePlaceId: "ChIJ7cv00DwsDogRAMDACa2m4K8",
        name: "Downtown Chicago",
        address: "Chicago, IL, USA",
        latitude: 41.8781136,
        longitude: -87.6297982,
      },
      views: {
        "4x4": makeView({
          id: "4x4",
          w: 4,
          h: 4,
          label: "4×4",
          order: 0,
          xs: MapPlace4x4,
        }),
      },
    }),
  },
});
