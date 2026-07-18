"use client";

import { newSyncRpcSession } from "@zerospin/core/utils/newSyncRpcSession";
import { Loader2, MapPin, Search, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ScraperApi } from "scraper/ScraperApi";
import type { IGooglePlaceSuggestion } from "scraper/types";

import { Input } from "../../ui/input";
import { cn } from "../../utils/cn";

export function GooglePlaceLookup(props: { value: string; onChange: (value: string) => void }) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<ReadonlyArray<IGooglePlaceSuggestion>>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [isLoadingInitialPlace, setIsLoadingInitialPlace] = useState(props.value.length > 0);
  const [isSelected, setIsSelected] = useState(props.value.length > 0);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [lookupError, setLookupError] = useState<string>();
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  const fetchSuggestions = useCallback(async (input: string) => {
    const normalizedInput = input.trim();
    if (normalizedInput.length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    setIsLoadingSuggestions(true);
    setLookupError(undefined);

    try {
      using api = newSyncRpcSession<ScraperApi>("/scraper-rpc");
      const result = await api.googlePlacesRepo().autocomplete(normalizedInput);

      if (result._tag === "Left") {
        setSuggestions([]);
        setLookupError(result.left.message);
        setIsOpen(true);
        return;
      }

      setSuggestions(result.right);
      setIsOpen(true);
    } catch (cause) {
      setSuggestions([]);
      setLookupError(cause instanceof Error ? cause.message : String(cause));
      setIsOpen(true);
    } finally {
      setIsLoadingSuggestions(false);
    }
  }, []);

  useEffect(() => {
    if (props.value.length === 0) {
      setIsLoadingInitialPlace(false);
      return;
    }

    let isCancelled = false;
    setIsLoadingInitialPlace(true);

    void (async () => {
      try {
        using api = newSyncRpcSession<ScraperApi>("/scraper-rpc");
        const result = await api.googlePlacesRepo().getPlace(props.value);

        if (isCancelled) {
          return;
        }

        if (result._tag === "Left") {
          setLookupError(result.left.message);
          setQuery(props.value);
          return;
        }

        setLookupError(undefined);
        setQuery(result.right.name);
        setIsSelected(true);
      } catch (cause) {
        if (!isCancelled) {
          setLookupError(cause instanceof Error ? cause.message : String(cause));
          setQuery(props.value);
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingInitialPlace(false);
        }
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [props.value]);

  useEffect(() => {
    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current);
    }

    if (isSelected || query.trim().length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      void fetchSuggestions(query);
    }, 300);

    return () => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [fetchSuggestions, isSelected, query]);

  useEffect(() => {
    const closeOnOutsidePointer = (event: MouseEvent) => {
      if (containerRef.current !== null && !event.composedPath().includes(containerRef.current)) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    };

    document.addEventListener("mousedown", closeOnOutsidePointer);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsidePointer);
    };
  }, []);

  return (
    <div className="relative w-full" ref={containerRef}>
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5">
          {isLoadingSuggestions || isLoadingInitialPlace ? (
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-hidden />
          ) : (
            <Search className="size-3.5 text-muted-foreground" aria-hidden />
          )}
        </div>
        <Input
          aria-autocomplete="list"
          aria-controls="google-places-listbox"
          aria-expanded={isOpen}
          aria-label="googlePlaceId"
          autoComplete="off"
          className="h-9 pl-8 pr-8"
          onChange={(event) => {
            setQuery(event.target.value);
            setIsSelected(false);
            setLookupError(undefined);
            setActiveIndex(-1);

            if (props.value.length > 0) {
              props.onChange("");
            }
          }}
          onKeyDown={(event) => {
            if (!isOpen || suggestions.length === 0) {
              if (event.key === "Escape") {
                setIsOpen(false);
              }
              return;
            }

            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex((currentIndex) =>
                currentIndex < suggestions.length - 1 ? currentIndex + 1 : 0,
              );
              return;
            }

            if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((currentIndex) =>
                currentIndex > 0 ? currentIndex - 1 : suggestions.length - 1,
              );
              return;
            }

            if (event.key === "Enter" && activeIndex >= 0) {
              event.preventDefault();
              const suggestion = suggestions[activeIndex];
              if (suggestion !== undefined) {
                setQuery(suggestion.mainText);
                setSuggestions([]);
                setIsOpen(false);
                setIsSelected(true);
                setActiveIndex(-1);
                props.onChange(suggestion.placeId);
              }
              return;
            }

            if (event.key === "Escape") {
              setIsOpen(false);
              setActiveIndex(-1);
            }
          }}
          placeholder="Search for a place..."
          role="combobox"
          value={query}
        />
        {query.length > 0 ? (
          <button
            aria-label="Clear place search"
            className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => {
              setQuery("");
              setSuggestions([]);
              setLookupError(undefined);
              setIsOpen(false);
              setIsSelected(false);
              setActiveIndex(-1);
              props.onChange("");
            }}
            type="button"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        ) : null}
      </div>

      {isOpen ? (
        <div
          className="absolute left-0 right-0 z-50 mt-2 overflow-hidden rounded-md border border-border bg-background shadow-lg"
          id="google-places-listbox"
          role="listbox"
        >
          {lookupError !== undefined ? (
            <p className="m-0 px-3 py-4 text-sm text-destructive" role="alert">
              {lookupError}
            </p>
          ) : suggestions.length > 0 ? (
            <ul className="m-0 list-none p-1">
              {suggestions.map((suggestion, index) => (
                <li
                  aria-selected={index === activeIndex}
                  className={cn(
                    "flex cursor-pointer items-start gap-2 rounded-sm px-3 py-2 transition-colors",
                    index === activeIndex
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/50",
                  )}
                  id={`google-place-option-${index}`}
                  key={suggestion.placeId}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    setQuery(suggestion.mainText);
                    setSuggestions([]);
                    setIsOpen(false);
                    setIsSelected(true);
                    setActiveIndex(-1);
                    props.onChange(suggestion.placeId);
                  }}
                  onMouseEnter={() => {
                    setActiveIndex(index);
                  }}
                  role="option"
                >
                  <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="m-0 truncate text-sm font-medium">{suggestion.mainText}</p>
                    {suggestion.secondaryText.length > 0 ? (
                      <p className="m-0 mt-0.5 truncate text-xs text-muted-foreground">
                        {suggestion.secondaryText}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : !isLoadingSuggestions && query.trim().length >= 2 ? (
            <p className="m-0 px-3 py-4 text-center text-sm text-muted-foreground">
              No places found for &ldquo;{query}&rdquo;
            </p>
          ) : null}
          <p className="m-0 border-t border-border px-3 py-1.5 text-right text-xs text-muted-foreground/60">
            Powered by Google Places
          </p>
        </div>
      ) : null}
    </div>
  );
}
