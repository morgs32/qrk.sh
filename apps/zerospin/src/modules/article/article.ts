import { defineModule } from "../make/defineModule";

export const article = defineModule({
  id: "article",
  abbreviation: "art",
  label: "Article",
  description: "Markdown articles authored with Meowdown.",
  maxPerPage: 1,
});
