import { mapValues } from "es-toolkit";
import { Effect, Schema } from "effect";

import { ScrapeError } from "../ScrapeError";
import { materialSymbols } from "./materialSymbols";

export const searchIcons = Effect.fn("searchIcons")(function* (props: {
  query: string;
  offset: number;
  limit: number;
}) {
  const { query, offset, limit } = props;
  yield* Schema.decodeUnknownEffect(
    Schema.Struct({
      query: Schema.String,
      offset: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
      limit: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(100)),
    }),
  )({ query, offset, limit }).pipe(
    Effect.mapError(
      () =>
        new ScrapeError({
          code: "invalid-scrape-request",
          message:
            "Icon search requires a string query, an offset of zero or greater, and a limit from 1 to 100",
        }),
    ),
  );

  const normalizedQuery = query
    .toLowerCase()
    .replace(/[_\s]+/g, " ")
    .trim();
  if (normalizedQuery.length < 2) {
    return {
      query: normalizedQuery,
      results: [],
      pagination: { total: 0, hasMore: false, offset: 0, nextOffset: 0 },
    };
  }

  const terms = normalizedQuery.split(" ");
  const matches = Object.values(mapValues(materialSymbols, (icon, hash) => ({ hash, ...icon })))
    .filter((icon) => {
      const { hash } = icon;
      const searchableName = `${hash.replaceAll("_", " ")} ${icon.name.toLowerCase()}`;
      return terms.every((term) => searchableName.includes(term));
    })
    .sort((left, right) => {
      const leftHash = left.hash;
      const rightHash = right.hash;
      const leftName = leftHash.replaceAll("_", " ");
      const rightName = rightHash.replaceAll("_", " ");
      const leftRank =
        leftName === normalizedQuery ? 0 : leftName.startsWith(normalizedQuery) ? 1 : 2;
      const rightRank =
        rightName === normalizedQuery ? 0 : rightName.startsWith(normalizedQuery) ? 1 : 2;
      return leftRank - rightRank || leftHash.localeCompare(rightHash);
    });
  const results = matches.slice(offset, offset + limit).map((icon) => ({
    hash: icon.hash,
    name: icon.name,
    svg: icon.svg,
    familyName: "Material Symbols Sharp Line",
    isFree: true,
  }));
  const nextOffset = offset + results.length;

  return {
    query: normalizedQuery,
    results,
    pagination: {
      total: matches.length,
      hasMore: nextOffset < matches.length,
      offset,
      nextOffset,
    },
  };
});
