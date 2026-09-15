import { createElement } from "react";

import { primitives } from "@zerospin/schema";

import { makeCatalog } from "../../makeCatalog";
import { makeFetcherConfiguration } from "../../makeFetcherConfiguration";
import { makeRegistry } from "../../makeRegistry";

import { GooglePlaceLookup } from "./GooglePlaceLookup";
import { MapPlace4x4 } from "./MapPlace4x4";

export const mapCatalog = makeCatalog({
  catalogName: "map",
  catalogLabel: "Map",
  catalogDescription: "Interactive maps centered on a selected Google place.",
  registries: {
    place: makeRegistry({
      registry: "place",
      registryName: "Place",
      registryDescription: "A map centered on one selected place.",
      configuration: makeFetcherConfiguration({
        registryOptionsShape: {
          googlePlaceId: primitives.text({
            defaultValue: "ChIJ7cv00DwsDogRAMDACa2m4K8",
          }),
        },
        registryOptionsForm: ({ value, onChange }) =>
          createElement(GooglePlaceLookup, {
            value: value.googlePlaceId,
            onChange: (googlePlaceId) => onChange({ googlePlaceId }),
          }),
        fetcher: async ({ api, registryOptions, setData }) => {
          const result = await api.googlePlacesRepo().getPlace(registryOptions.googlePlaceId);
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
