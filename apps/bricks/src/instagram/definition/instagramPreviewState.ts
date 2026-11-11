import type { IInferDecodedRow } from "@zerospin/shapes";
import type { instagramV1 } from "./instagramV1";

const defaultData = {
  username: "theonion",
  profileImageUrl: "https://www.instagram.com/static/images/ico/favicon-192.png/68d99ba29cc8.png",
  followersText: "5M",
  postImageUrls: [
    "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=800&q=80",
  ],
};

export const instagramPreviewState = {
  payload: { url: "https://www.instagram.com/theonion" },
  data: defaultData,
} satisfies IInferDecodedRow<typeof instagramV1.stateShape>;
