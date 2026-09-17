import { primitives } from "@zerospin/schema";

import { defineModule } from "../../make/defineModule";
import { makeDataFetcher } from "../../make/makeDataFetcher";
import { defaultSpec } from "./generative/defaultSpec";
import { linkJsonRenderCatalog } from "./generative/LinkJsonRenderCatalog";

export const link = defineModule({
  id: "link",
  label: "Link",
  description: "Rich link previews from JSON-LD and Open Graph metadata.",
  catalog: linkJsonRenderCatalog,
  data: makeDataFetcher({
    payloadShape: {
      url: primitives.text({
        defaultValue: "https://apps.apple.com/us/app/apple-store/id375380948",
      }),
    },
    fetcher: async ({ api, payload, setData }) => {
      const result = await api.linkBackend().getPreview(payload.url);
      if (result._tag === "Left") return result;
      setData(result.right);
      return { _tag: "Right", right: undefined };
    },
    dataShape: {
      url: primitives.text(),
      title: primitives.text(),
      description: primitives.text(),
      siteName: primitives.text(),
      imageUrl: primitives.text(),
      iconUrl: primitives.text(),
    },
    defaultData: {
      url: "https://apps.apple.com/",
      title: "Celebrate our birthday & get Pro free for one year",
      description: "Hmm a brief description of the link",
      siteName: "apps.apple.com",
      imageUrl:
        "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=800&q=80",
      iconUrl: "https://www.apple.com/favicon.ico",
    },
  }),
  breakpoints: {
    sm: {
      defaultSpec,
    },
  },
});
