import { createElement } from "react";

import { primitives } from "@zerospin/schema";

import { makeFetcherConfiguration } from "../../make/makeFetcherConfiguration";
import { makeModule } from "../../make/makeModule";

import { GooglePlaceLookup } from "./GooglePlaceLookup";
import { MapPlaceCanvas } from "./MapPlaceCanvas";

export const mapPlace = makeModule({
  id: "map-place",
  label: "Map Place",
  description: "A map centered on one selected place.",
  configuration: makeFetcherConfiguration({
    moduleOptionsShape: {
      googlePlaceId: primitives.text({
        defaultValue: "ChIJ7cv00DwsDogRAMDACa2m4K8"})},
    moduleOptionsForm: ({ value, onChange }) =>
      createElement(GooglePlaceLookup, {
        value: value.googlePlaceId,
        onChange: (googlePlaceId) => onChange({ googlePlaceId })}),
    fetcher: async ({ api, moduleOptions, setData }) => {
      const result = await api.googlePlacesRepo().getPlace(moduleOptions.googlePlaceId);
      if (result._tag === "Left") return result;
      setData(result.right);
      return { _tag: "Right", right: undefined };
    }}),
  dataShape: {
    googlePlaceId: primitives.text(),
    name: primitives.text(),
    address: primitives.text(),
    latitude: primitives.number(),
    longitude: primitives.number()},
  defaultData: {
    googlePlaceId: "ChIJ7cv00DwsDogRAMDACa2m4K8",
    name: "Downtown Chicago",
    address: "Chicago, IL, USA",
    latitude: 41.8781136,
    longitude: -87.6297982},
  sm: { component: MapPlaceCanvas, w: 4, h: 4 }});
