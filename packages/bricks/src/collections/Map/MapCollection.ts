import { primitives } from "@zerospin/core/models/primitives";

import { makeBrick } from "../../makeBrick";
import { makeCollection } from "../../makeCollection";
import { makeVariant } from "../../makeVariant";
import { GooglePlaceLookup } from "./GooglePlaceLookup";
import { MapPlace4x4 } from "./MapPlace4x4";

export const mapCollection = makeCollection({
  collectionName: "map",
  collectionLabel: "Map",
  collectionDescription: "Interactive maps centered on a selected Google place.",
  variants: {
    place: makeVariant({
      variant: "place",
      variantDescription: "A map centered on one selected place.",
      payloadShape: {
        googlePlaceId: primitives.text({ defaultValue: "ChIJ7cv00DwsDogRAMDACa2m4K8" }),
      },
      payloadForm: {
        googlePlaceId: GooglePlaceLookup,
      },
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
      getData: ({ api, payload }) => api.googlePlacesRepo().getPlace(payload.googlePlaceId),
      sizes: {
        "4x4": makeBrick({
          variant: "place",
          size: "4x4",
          w: 4,
          h: 4,
          label: "4×4",
          order: 0,
          component: MapPlace4x4,
        }),
      },
    }),
  },
});
