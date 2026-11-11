"use client";

import { Spinner } from "../../../components/spinner";
import { Image } from "@unpic/react";
import { mapValues } from "es-toolkit";
import { Check, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "../../../components/button";
import { TextInput } from "../../../components/TextInput";
import { cn } from "cn";

const SEARCH_PAGE_SIZE = 48;

export function MaterialSymbolsIconLookup(props: {
  value: string;
  saveError?: string;
  onChange: (value: { hash: string; name: string; svg: string }) => void;
}) {
  const { value, onChange, saveError } = props;
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(SEARCH_PAGE_SIZE);
  const [catalog, setCatalog] =
    useState<typeof import("../catalog/materialSymbols").materialSymbols>();
  const [catalogError, setCatalogError] = useState<string>();
  const normalizedQuery = query
    .toLowerCase()
    .replace(/[_\s]+/g, " ")
    .trim();
  const isSearching = normalizedQuery.length >= 2;

  useEffect(() => {
    if (!isSearching || catalog !== undefined) return;

    let current = true;
    void import("../catalog/materialSymbols").then(
      ({ materialSymbols }) => {
        if (current) {
          setCatalog(materialSymbols);
          setCatalogError(undefined);
        }
      },
      () => {
        if (current) setCatalogError("Could not load Material Symbols.");
      },
    );

    return () => {
      current = false;
    };
  }, [catalog, isSearching]);

  const matches = useMemo(() => {
    if (!isSearching || catalog === undefined) return [];

    const terms = normalizedQuery.split(" ");
    return Object.values(mapValues(catalog, (icon, hash) => ({ hash, ...icon })))
      .filter(({ hash, name }) => {
        const searchableName = `${hash.replaceAll("_", " ")} ${name.toLowerCase()}`;
        return terms.every((term) => searchableName.includes(term));
      })
      .sort((left, right) => {
        const leftHash = left.hash.replaceAll("_", " ");
        const rightHash = right.hash.replaceAll("_", " ");
        const leftRank =
          leftHash === normalizedQuery ? 0 : leftHash.startsWith(normalizedQuery) ? 1 : 2;
        const rightRank =
          rightHash === normalizedQuery ? 0 : rightHash.startsWith(normalizedQuery) ? 1 : 2;
        return leftRank - rightRank || leftHash.localeCompare(rightHash);
      });
  }, [catalog, isSearching, normalizedQuery]);

  return (
    <div className="flex flex-col gap-3">
      <TextInput
        label="Search icons"
        leadingIcon={<Search className="size-3.5" />}
        description={isSearching ? undefined : "Enter at least two characters to search."}
        error={saveError ?? (isSearching ? catalogError : undefined)}
        autoComplete="off"
        onChange={(event) => {
          setQuery(event.target.value);
          setVisibleCount(SEARCH_PAGE_SIZE);
        }}
        placeholder="Search Material Symbols icons..."
        type="search"
        value={query}
      />

      {value.length > 0 ? (
        <p className="m-0 truncate">
          Selected: <span className="font-mono">{value}</span>
        </p>
      ) : null}

      {!isSearching || catalogError !== undefined ? null : catalog === undefined ? (
        <div className="flex items-center justify-center gap-2 py-6">
          <Spinner aria-hidden />
          Searching Material Symbols...
        </div>
      ) : matches.length > 0 ? (
        <>
          <div
            className="grid grid-cols-8 gap-2"
            role="group"
            aria-label="Material Symbols icon results"
          >
            {matches.slice(0, visibleCount).map((icon) => (
              <Button
                variant="outline"
                aria-label={`${icon.name}, Material Symbols Sharp Line`}
                aria-current={value === icon.hash || undefined}
                className={cn(
                  "relative flex size-auto min-w-0 aspect-square items-center justify-center rounded-md border bg-background p-2 transition-colors hover:bg-accent",
                  value === icon.hash ? "border-primary ring-2 ring-primary/20" : "border-border",
                )}
                key={icon.hash}
                onClick={() => {
                  onChange({ hash: icon.hash, name: icon.name, svg: icon.svg });
                }}
                type="button"
              >
                <Image
                  alt=""
                  className="size-full object-contain"
                  height={96}
                  layout="constrained"
                  src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(icon.svg)}`}
                  width={96}
                />
                {value === icon.hash ? (
                  <span className="absolute right-1 top-1 rounded-full bg-primary p-0.5">
                    <Check aria-hidden className="size-3" />
                  </span>
                ) : null}
              </Button>
            ))}
          </div>

          {visibleCount < matches.length ? (
            <Button
              className="w-full"
              onClick={() => {
                setVisibleCount((count) => count + SEARCH_PAGE_SIZE);
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              Load more ({matches.length} total)
            </Button>
          ) : null}
        </>
      ) : (
        <p className="m-0 py-4 text-center">No icons found for &ldquo;{query.trim()}&rdquo;.</p>
      )}

      <p className="m-0 text-right">Material Symbols by Google</p>
    </div>
  );
}
