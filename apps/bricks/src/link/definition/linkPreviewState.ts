import type { IInferDecodedRow } from "@zerospin/shapes";
import type { linkV1 } from "./linkV1";

const defaultData = {
  url: "https://apps.apple.com/",
  title: "Celebrate our birthday & get Pro free for one year",
  description: "Hmm a brief description of the link",
  siteName: "apps.apple.com",
  imageUrl:
    "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=800&q=80",
  iconUrl: "https://www.apple.com/favicon.ico",
};

export const linkPreviewState = {
  payload: { url: "https://apps.apple.com/us/app/apple-store/id375380948" },
  data: defaultData,
} satisfies IInferDecodedRow<typeof linkV1.stateShape>;
