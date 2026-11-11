"use client";

import { Combobox } from "@base-ui/react/combobox";
import { newSyncRpcSession } from "@zerospin/core/utils/getApi/newSyncRpcSession/newSyncRpcSession";
import { Loader2, MapPin, Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "../../react/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "../../react/input-group";
import { useWarnBeforeUnload } from "../../react/useWarnBeforeUnload";
import type { LibraryApi } from "../../rpc/LibraryApi";
import type { IGooglePlaceSuggestion, IRpcEither } from "../../rpc/types";

async function searchGooglePlaces(query: string, signal: AbortSignal) {
  using api = newSyncRpcSession<LibraryApi>("/rpc");
  const close = () => api[Symbol.dispose]();
  signal.addEventListener("abort", close, { once: true });
  try {
    return await api.googlePlacesBackend().autocomplete(query);
  } finally {
    signal.removeEventListener("abort", close);
  }
}

export function GooglePlaceLookup(props: {
  value: string;
  onChange: (value: string) => void;
  saveError?: string;
  status?: string;
  disabled?: boolean;
  searchPlaces?: (
    query: string,
    signal: AbortSignal,
  ) => Promise<IRpcEither<readonly IGooglePlaceSuggestion[]>>;
}) {
  const { value, onChange, saveError, status, disabled, searchPlaces = searchGooglePlaces } = props;
  const id = useId();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<IGooglePlaceSuggestion | null>(null);
  const [suggestions, setSuggestions] = useState<readonly IGooglePlaceSuggestion[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [isLoadingInitialPlace, setIsLoadingInitialPlace] = useState(value !== "");
  const [open, setOpen] = useState(false);
  const [lookupError, setLookupError] = useState<string>();
  const activeSuggestions = useRef<AbortController | null>(null);
  const activeInitialPlace = useRef<AbortController | null>(null);

  const selection = selected?.placeId === value ? selected : null;
  const items =
    selection !== null && !suggestions.some((item) => item.placeId === selection.placeId)
      ? [selection, ...suggestions]
      : suggestions;
  const error = saveError ?? lookupError;
  const canSearch = value === "" && query.trim().length >= 2;
  useWarnBeforeUnload(value === "" && query.length > 0);

  useEffect(() => {
    if (value === "" || selection !== null) {
      setIsLoadingInitialPlace(false);
      return;
    }

    const controller = new AbortController();
    activeInitialPlace.current = controller;
    setIsLoadingInitialPlace(true);
    setLookupError(undefined);
    void (async () => {
      try {
        using api = newSyncRpcSession<LibraryApi>("/rpc");
        const close = () => api[Symbol.dispose]();
        controller.signal.addEventListener("abort", close, { once: true });
        try {
          const result = await api.googlePlacesBackend().getPlace(value);
          if (controller.signal.aborted) return;
          if (result._tag === "Left") {
            setLookupError(result.left.message);
            setQuery(value);
            return;
          }
          const { name, address } = result.right;
          setSelected({
            placeId: value,
            mainText: name,
            secondaryText: address,
            description: name,
          });
          setQuery(name);
        } finally {
          controller.signal.removeEventListener("abort", close);
        }
      } catch (cause) {
        if (controller.signal.aborted) return;
        setLookupError(cause instanceof Error ? cause.message : String(cause));
        setQuery(value);
      } finally {
        if (activeInitialPlace.current === controller) {
          activeInitialPlace.current = null;
          setIsLoadingInitialPlace(false);
        }
      }
    })();

    return () => {
      activeInitialPlace.current = null;
      controller.abort();
    };
  }, [selection, value]);

  useEffect(() => {
    if (!canSearch) return;
    const controller = new AbortController();
    activeSuggestions.current = controller;
    setIsLoadingSuggestions(true);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const result = await searchPlaces(query.trim(), controller.signal);
          if (controller.signal.aborted) return;
          if (result._tag === "Left") {
            setLookupError(result.left.message);
            return;
          }
          setSuggestions(result.right);
        } catch (cause) {
          if (!controller.signal.aborted)
            setLookupError(cause instanceof Error ? cause.message : String(cause));
        } finally {
          if (activeSuggestions.current === controller) {
            activeSuggestions.current = null;
            setIsLoadingSuggestions(false);
          }
        }
      })();
    }, 300);

    return () => {
      clearTimeout(timer);
      activeSuggestions.current = null;
      controller.abort();
    };
  }, [canSearch, query, searchPlaces]);

  function editQuery(next: string) {
    activeSuggestions.current?.abort();
    activeInitialPlace.current?.abort();
    setQuery(next);
    setSelected(null);
    setSuggestions([]);
    setLookupError(undefined);
    setIsLoadingSuggestions(false);
    setIsLoadingInitialPlace(false);
    if (next.trim().length < 2) setOpen(false);
    if (value !== "") onChange("");
  }

  return (
    <Field orientation="horizontal">
      <FieldLabel htmlFor={id}>Place</FieldLabel>
      <FieldContent>
        <Combobox.Root
          items={items}
          filter={null}
          value={selection}
          inputValue={query}
          open={open && canSearch && lookupError === undefined}
          onOpenChange={setOpen}
          openOnInputClick={false}
          disabled={disabled}
          itemToStringLabel={(item) => item.mainText}
          itemToStringValue={(item) => item.placeId}
          isItemEqualToValue={(item, current) => item.placeId === current.placeId}
          onInputValueChange={(next, details) => {
            if (details.reason === "input-change") editQuery(next);
          }}
          onValueChange={(next) => {
            if (next === null) return;
            activeSuggestions.current?.abort();
            setSelected(next);
            setQuery(next.mainText);
            setSuggestions([]);
            setLookupError(undefined);
            setIsLoadingSuggestions(false);
            onChange(next.placeId);
          }}
        >
          <Combobox.InputGroup render={<InputGroup />}>
            <Combobox.Input
              id={id}
              render={<InputGroupInput />}
              aria-describedby={error === undefined ? undefined : `${id}-error`}
              placeholder="Search for a place..."
            />
            <InputGroupAddon aria-hidden="true">
              {isLoadingSuggestions || isLoadingInitialPlace ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Search className="size-3.5" />
              )}
            </InputGroupAddon>
            {query === "" ? null : (
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  aria-label="Clear place search"
                  disabled={disabled}
                  onClick={() => editQuery("")}
                >
                  <X aria-hidden="true" className="size-3.5" />
                </InputGroupButton>
              </InputGroupAddon>
            )}
          </Combobox.InputGroup>
          <Combobox.Portal>
            <Combobox.Positioner sideOffset={4} className="z-50">
              <Combobox.Popup className="qrk-bricks w-(--anchor-width) overflow-hidden rounded-md border border-border bg-background text-xs text-foreground shadow-lg">
                <Combobox.Status className="px-3 py-4 text-center empty:hidden">
                  {isLoadingSuggestions ? "Searching…" : null}
                </Combobox.Status>
                <Combobox.Empty className="px-3 py-4 text-center empty:hidden">
                  {isLoadingSuggestions ? null : `No places found for “${query}”`}
                </Combobox.Empty>
                <Combobox.List className="max-h-64 overflow-auto empty:hidden">
                  {(item: IGooglePlaceSuggestion) => (
                    <Combobox.Item
                      key={item.placeId}
                      value={item}
                      className="flex cursor-default items-start gap-2 rounded-sm px-3 py-2 outline-none data-[highlighted]:bg-accent"
                    >
                      <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="m-0 truncate font-medium">{item.mainText}</p>
                        {item.secondaryText === "" ? null : (
                          <p className="m-0 mt-0.5 truncate">{item.secondaryText}</p>
                        )}
                      </div>
                    </Combobox.Item>
                  )}
                </Combobox.List>
                <p className="m-0 border-t border-border px-3 py-1.5 text-right">
                  Powered by Google Places
                </p>
              </Combobox.Popup>
            </Combobox.Positioner>
          </Combobox.Portal>
        </Combobox.Root>
        {error === undefined ? null : <FieldError id={`${id}-error`}>{error}</FieldError>}
        {status === undefined ? null : <FieldDescription role="status">{status}</FieldDescription>}
      </FieldContent>
    </Field>
  );
}
