import { createElement } from "react";

import { primitives } from "@zerospin/schema";

import { makeGroup } from "../../makeGroup";
import { makeFetcherConfiguration } from "../../makeFetcherConfiguration";
import { makeCatalog } from "../../makeCatalog";

import { GooglePlaceLookup } from "./catalogs/place/GooglePlaceLookup";
import { MapPlace4x4 } from "./catalogs/place/MapPlace4x4";

export const mapGroup = makeGroup({
  id: "map",
  label: "Map",
  description: "Interactive maps centered on a selected Google place.",
  catalogs: {
    place: makeCatalog({
      id: "place",
      label: "Place",
      description: "A map centered on one selected place.",
      configuration: makeFetcherConfiguration({
        catalogOptionsShape: {
          googlePlaceId: primitives.text({
            defaultValue: "ChIJ7cv00DwsDogRAMDACa2m4K8",
          }),
        },
        catalogOptionsForm: ({ value, onChange }) =>
          createElement(GooglePlaceLookup, {
            value: value.googlePlaceId,
            onChange: (googlePlaceId) => onChange({ googlePlaceId }),
          }),
        fetcher: async ({ api, catalogOptions, setData }) => {
          const result = await api.googlePlacesRepo().getPlace(catalogOptions.googlePlaceId);
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
      order: 0,
      xs: { component: MapPlace4x4, w: 4, h: 4 },
    }),
  },
});
