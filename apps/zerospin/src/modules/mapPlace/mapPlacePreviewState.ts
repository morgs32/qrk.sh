import type { IInferDecodedRow } from "@zerospin/shapes";
import type { mapPlaceV1 } from "./mapPlaceV1";

const defaultData = {
  googlePlaceId: "ChIJ7cv00DwsDogRAMDACa2m4K8",
  name: "Downtown Chicago",
  address: "Chicago, IL, USA",
  latitude: 41.8781136,
  longitude: -87.6297982,
};

export const mapPlacePreviewState = {
  payload: { googlePlaceId: "ChIJ7cv00DwsDogRAMDACa2m4K8" },
  data: defaultData,
} satisfies IInferDecodedRow<typeof mapPlaceV1.stateShape>;
