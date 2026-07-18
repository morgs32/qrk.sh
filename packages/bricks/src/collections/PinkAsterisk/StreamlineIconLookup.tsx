"use client";

import { newSyncRpcSession } from "@zerospin/core/utils/newSyncRpcSession";
import { Image } from "@unpic/react";
import { Check, Loader2, Search } from "lucide-react";
import { useEffect, useState } from "react";
import type { ScraperApi } from "scraper/ScraperApi";
import useSWRInfinite from "swr/infinite";

import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { cn } from "../../utils/cn";

const SEARCH_PAGE_SIZE = 24;

export function StreamlineIconLookup(props: { value: string; onChange: (value: string) => void }) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 300);

    return () => {
      clearTimeout(timeout);
    };
  }, [query]);

  const { data, error, isLoading, isValidating, setSize } = useSWRInfinite<{
    query: string;
    results: ReadonlyArray<{
      hash: string;
      name: string;
      imagePreviewUrl: string;
      familyName: string;
      isFree: boolean;
    }>;
    pagination: {
      total: number;
      hasMore: boolean;
      offset: number;
      nextOffset: number;
    };
  }>(
    (pageIndex, previousPageData) => {
      if (debouncedQuery.length < 2) {
        return null;
      }

      if (pageIndex === 0) {
        return ["streamline-icon-search", debouncedQuery, 0, SEARCH_PAGE_SIZE];
      }

      if (previousPageData === null || !previousPageData.pagination.hasMore) {
        return null;
      }

      return [
        "streamline-icon-search",
        debouncedQuery,
        previousPageData.pagination.nextOffset,
        SEARCH_PAGE_SIZE,
      ];
    },
    async ([, searchQuery, offset, limit]: [string, string, number, number]) => {
      using api = newSyncRpcSession<ScraperApi>("/scraper-rpc");
      const result = await api.streamlineRepo().search(searchQuery, offset, limit);

      if (result._tag === "Left") {
        throw new Error(result.left.message);
      }

      return result.right;
    },
    {
      keepPreviousData: false,
      revalidateFirstPage: false,
    },
  );

  const lastPage = data?.at(-1);
  const hasResults = data?.some((page) => page.results.length > 0) ?? false;

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          aria-label="Search Streamline icons"
          autoComplete="off"
          className="h-9 pl-8"
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          placeholder="Search Streamline icons..."
          type="search"
          value={query}
        />
      </div>

      {props.value.length > 0 ? (
        <p className="m-0 truncate text-xs text-muted-foreground">
          Selected: <span className="font-mono">{props.value}</span>
        </p>
      ) : null}

      {error instanceof Error ? (
        <p
          className="m-0 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          role="alert"
        >
          {error.message}
        </p>
      ) : null}

      {debouncedQuery.length < 2 ? (
        <p className="m-0 py-4 text-center text-sm text-muted-foreground">
          Enter at least two characters to search.
        </p>
      ) : isLoading ? (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 aria-hidden className="size-4 animate-spin" />
          Searching Streamline...
        </div>
      ) : hasResults ? (
        <>
          <div
            className="grid grid-cols-4 gap-2"
            role="listbox"
            aria-label="Streamline icon results"
          >
            {data?.map((page) =>
              page.results.map((icon) => (
                <button
                  aria-label={`${icon.name}, ${icon.familyName}`}
                  aria-selected={props.value === icon.hash}
                  className={cn(
                    "relative flex aspect-square items-center justify-center rounded-md border bg-background p-2 transition-colors hover:bg-accent",
                    props.value === icon.hash
                      ? "border-primary ring-2 ring-primary/20"
                      : "border-border",
                  )}
                  key={icon.hash}
                  onClick={() => {
                    props.onChange(icon.hash);
                  }}
                  role="option"
                  type="button"
                >
                  <Image
                    alt=""
                    className="size-full object-contain"
                    height={96}
                    layout="constrained"
                    src={icon.imagePreviewUrl}
                    width={96}
                  />
                  {props.value === icon.hash ? (
                    <span className="absolute right-1 top-1 rounded-full bg-primary p-0.5 text-primary-foreground">
                      <Check aria-hidden className="size-3" />
                    </span>
                  ) : null}
                </button>
              )),
            )}
          </div>

          {lastPage?.pagination.hasMore ? (
            <Button
              className="w-full"
              disabled={isValidating}
              onClick={() => {
                void setSize((currentSize) => currentSize + 1);
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              {isValidating ? (
                <>
                  <Loader2 aria-hidden className="size-4 animate-spin" />
                  Loading icons...
                </>
              ) : (
                `Load more (${lastPage.pagination.total} total)`
              )}
            </Button>
          ) : null}
        </>
      ) : (
        <p className="m-0 py-4 text-center text-sm text-muted-foreground">
          No icons found for &ldquo;{debouncedQuery}&rdquo;.
        </p>
      )}

      <p className="m-0 text-right text-xs text-muted-foreground/60">Powered by Streamline</p>
    </div>
  );
}
