"use client";

import { newSyncRpcSession } from "@zerospin/core/utils/getApi/newSyncRpcSession/newSyncRpcSession";
import { Loader2, MapPin, Search, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { LibraryApi } from "../../worker/LibraryApi.public";
import type { IGooglePlaceSuggestion } from "../../worker/types.public";

import { Input } from "../../components/ui/input";
import { cn } from "cn";

export function GooglePlaceLookup(props: { value: string; onChange: (value: string) => void }) {
  const { value, onChange } = props;
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<ReadonlyArray<IGooglePlaceSuggestion>>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [isLoadingInitialPlace, setIsLoadingInitialPlace] = useState(value.length > 0);
  const [isSelected, setIsSelected] = useState(value.length > 0);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [lookupError, setLookupError] = useState<string>();
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const activeSuggestions = useRef<AbortController | null>(null);
  const activeInitialPlace = useRef<AbortController | null>(null);

  useLayoutEffect(() => {
    return () => {
      activeSuggestions.current?.abort();
      activeSuggestions.current = null;
      activeInitialPlace.current?.abort();
      activeInitialPlace.current = null;
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    };
  }, []);

  const fetchSuggestions = useCallback(async (input: string) => {
    const normalizedInput = input.trim();
    if (normalizedInput.length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    activeSuggestions.current?.abort();
    const controller = new AbortController();
    activeSuggestions.current = controller;
    setIsLoadingSuggestions(true);
    setLookupError(undefined);

    try {
      using api = newSyncRpcSession<LibraryApi>("/rpc");
      const result = await api.googlePlacesBackend().autocomplete(normalizedInput);
      if (controller.signal.aborted || activeSuggestions.current !== controller) return;

      if (result._tag === "Left") {
        setSuggestions([]);
        setLookupError(result.left.message);
        setIsOpen(true);
        return;
      }

      setSuggestions(result.right);
      setIsOpen(true);
    } catch (cause) {
      if (controller.signal.aborted || activeSuggestions.current !== controller) return;
      setSuggestions([]);
      setLookupError(cause instanceof Error ? cause.message : String(cause));
      setIsOpen(true);
    } finally {
      if (activeSuggestions.current === controller) {
        activeSuggestions.current = null;
        setIsLoadingSuggestions(false);
      }
    }
  }, []);

  useLayoutEffect(() => {
    if (value.length === 0) {
      setIsLoadingInitialPlace(false);
      return;
    }

    const controller = new AbortController();
    activeInitialPlace.current = controller;
    setIsLoadingInitialPlace(true);

    void (async () => {
      try {
        using api = newSyncRpcSession<LibraryApi>("/rpc");
        const result = await api.googlePlacesBackend().getPlace(value);

        if (controller.signal.aborted || activeInitialPlace.current !== controller) {
          return;
        }

        if (result._tag === "Left") {
          setLookupError(result.left.message);
          setQuery(value);
          return;
        }

        setLookupError(undefined);
        setQuery(result.right.name);
        setIsSelected(true);
      } catch (cause) {
        if (!controller.signal.aborted && activeInitialPlace.current === controller) {
          setLookupError(cause instanceof Error ? cause.message : String(cause));
          setQuery(value);
        }
      } finally {
        if (activeInitialPlace.current === controller) {
          activeInitialPlace.current = null;
          setIsLoadingInitialPlace(false);
        }
      }
    })();

    return () => {
      controller.abort();
      if (activeInitialPlace.current === controller) activeInitialPlace.current = null;
    };
  }, [value]);

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

    document.addEventListener("click", closeOnOutsidePointer);
    return () => {
      document.removeEventListener("click", closeOnOutsidePointer);
    };
  }, []);

  return (
    <div className="relative w-full" ref={containerRef}>
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5">
          {isLoadingSuggestions || isLoadingInitialPlace ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <Search className="size-3.5" aria-hidden />
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
            activeSuggestions.current?.abort();
            activeSuggestions.current = null;
            activeInitialPlace.current?.abort();
            activeInitialPlace.current = null;
            setIsLoadingSuggestions(false);
            setIsLoadingInitialPlace(false);
            setSuggestions([]);
            setIsOpen(false);
            setQuery(event.target.value);
            setIsSelected(false);
            setLookupError(undefined);
            setActiveIndex(-1);

            if (value.length > 0) {
              onChange("");
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && isOpen) {
              event.preventDefault();
              setIsOpen(false);
              setActiveIndex(-1);
              return;
            }

            if (!isOpen || suggestions.length === 0) {
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
                activeSuggestions.current?.abort();
                activeSuggestions.current = null;
                setIsLoadingSuggestions(false);
                setQuery(suggestion.mainText);
                setSuggestions([]);
                setIsOpen(false);
                setIsSelected(true);
                setActiveIndex(-1);
                onChange(suggestion.placeId);
              }
              return;
            }
          }}
          placeholder="Search for a place..."
          role="combobox"
          value={query}
        />
        {query.length > 0 ? (
          <button
            aria-label="Clear place search"
            className="absolute inset-y-0 right-0 flex items-center pr-2.5"
            onClick={() => {
              activeSuggestions.current?.abort();
              activeSuggestions.current = null;
              activeInitialPlace.current?.abort();
              activeInitialPlace.current = null;
              setIsLoadingSuggestions(false);
              setIsLoadingInitialPlace(false);
              setQuery("");
              setSuggestions([]);
              setLookupError(undefined);
              setIsOpen(false);
              setIsSelected(false);
              setActiveIndex(-1);
              onChange("");
            }}
            type="button"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        ) : null}
      </div>

      {isOpen ? (
        <div
          className="relative z-50 mt-2 overflow-hidden rounded-md border border-border bg-background shadow-lg"
          id="google-places-listbox"
          role="listbox"
        >
          {lookupError !== undefined ? (
            <p className="m-0 px-3 py-4" role="alert">
              {lookupError}
            </p>
          ) : suggestions.length > 0 ? (
            <ul className="m-0 list-none p-1">
              {suggestions.map((suggestion, index) => (
                <li
                  aria-selected={index === activeIndex}
                  className={cn(
                    "flex cursor-pointer items-start gap-2 rounded-sm px-3 py-2 transition-colors",
                    index === activeIndex ? "bg-accent" : "hover:bg-accent/50",
                  )}
                  id={`google-place-option-${index}`}
                  key={suggestion.placeId}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    activeSuggestions.current?.abort();
                    activeSuggestions.current = null;
                    setIsLoadingSuggestions(false);
                    setQuery(suggestion.mainText);
                    setSuggestions([]);
                    setIsOpen(false);
                    setIsSelected(true);
                    setActiveIndex(-1);
                    onChange(suggestion.placeId);
                  }}
                  onMouseEnter={() => {
                    setActiveIndex(index);
                  }}
                  role="option"
                >
                  <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="m-0 truncate font-medium">{suggestion.mainText}</p>
                    {suggestion.secondaryText.length > 0 ? (
                      <p className="m-0 mt-0.5 truncate">{suggestion.secondaryText}</p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : !isLoadingSuggestions && query.trim().length >= 2 ? (
            <p className="m-0 px-3 py-4 text-center">No places found for &ldquo;{query}&rdquo;</p>
          ) : null}
          <p className="m-0 border-t border-border px-3 py-1.5 text-right">
            Powered by Google Places
          </p>
        </div>
      ) : null}
    </div>
  );
}
