"use client";

import { Select } from "@base-ui/react/select";
import type { IResult } from "@zerospin/error";
import { makeEffectSchema, type IInferDecodedRow } from "@zerospin/shapes";
import { Schema } from "effect";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { useSWRConfig } from "swr";
import { Button } from "../../../components/button";
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "../../../components/field";
import { ImageUploadInput } from "../../../components/ImageUploadInput";
import {
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "../../../components/select";
import { TextInput } from "../../../components/TextInput";
import { useWarnBeforeUnload } from "../../react/useWarnBeforeUnload";
import type {} from "../../image/react/ImageUploadSWR";
import { imageCarouselV1 } from "../definition/imageCarouselV1";

const schema = Schema.toType(makeEffectSchema(imageCarouselV1.stateShape));
const emptyState = { slides: [], interval: 5 };

export function ImageCarouselForm(props: {
  state: IInferDecodedRow<typeof imageCarouselV1.stateShape> | null;
  onSave: (
    state: IInferDecodedRow<typeof imageCarouselV1.stateShape>,
  ) => IResult<unknown, { message: string }>;
  previewWidth?: number;
  measureFrame?: (selector: string) => number | undefined;
}) {
  const { state, onSave, previewWidth, measureFrame } = props;
  const { uploadImage } = useSWRConfig();
  const working = useRef(state ?? emptyState);
  const hasPending = useRef(false);
  const intervalId = useId();
  const [pending, setPending] = useState<typeof state>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  useLayoutEffect(() => {
    if (!hasPending.current) working.current = state ?? emptyState;
  }, [state]);
  useWarnBeforeUnload(Object.keys(drafts).length > 0 || pending !== null);
  const current = pending ?? state ?? emptyState;
  const { defaultWidth, defaultHeight, minWidth } =
    imageCarouselV1.variants.default;
  const ratio = () =>
    measureFrame?.("[data-image-carousel-frame]") ??
    Math.max(minWidth, Math.min(defaultWidth, previewWidth ?? defaultWidth)) /
      (defaultHeight ?? 360);

  function save(next: typeof current) {
    try {
      const decoded = Schema.decodeUnknownSync(schema)(next);
      const result = onSave(decoded);
      if (result._tag === "Failure") {
        working.current = decoded;
        hasPending.current = true;
        setPending(decoded);
        setError(result.failure.message ?? "Brick save was refused");
        return false;
      }
      working.current = decoded;
      hasPending.current = false;
      setPending(null);
      setDrafts((previous) => {
        const nextDrafts = { ...previous };
        for (const id of Object.keys(nextDrafts)) {
          const slide = decoded.slides.find((item) => item.id === id);
          if (slide === undefined || nextDrafts[id] === slide.alt) delete nextDrafts[id];
        }
        return nextDrafts;
      });
      setError(undefined);
      return true;
    } catch (cause) {
      working.current = next;
      hasPending.current = true;
      setPending(next);
      setError(
        cause instanceof Error ? cause.message : "Failed to save carousel",
      );
      return false;
    }
  }

  return (
    <FieldGroup>
      <Field orientation="horizontal">
        <FieldLabel htmlFor={intervalId}>Slide interval</FieldLabel>
        <FieldContent>
          <Select.Root
            value={current.interval}
            onValueChange={(value) => {
              if (value !== null) save({ ...working.current, interval: value });
            }}
          >
            <SelectTrigger id={intervalId}>
              <Select.Value />
            </SelectTrigger>
            <SelectContent>
              {[3, 4, 5, 6, 7, 8, 9, 10].map((value) => (
                <SelectItem key={value} value={value}>
                  {value} seconds
                </SelectItem>
              ))}
            </SelectContent>
          </Select.Root>
        </FieldContent>
      </Field>
      {current.slides.map((slide, index) => (
        <div
          key={slide.id}
          className="space-y-2 rounded-md border border-border p-2"
        >
          <div className="flex items-center justify-between gap-1">
            <span className="text-xs font-medium">Image {index + 1}</span>
            <div className="flex gap-1">
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                aria-label={`Move image ${index + 1} up`}
                disabled={index === 0}
                onClick={() => {
                  const slides = [...working.current.slides];
                  [slides[index - 1], slides[index]] = [
                    slides[index],
                    slides[index - 1],
                  ];
                  save({ ...working.current, slides });
                }}
              >
                <ArrowUp aria-hidden="true" />
              </Button>
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                aria-label={`Move image ${index + 1} down`}
                disabled={index === current.slides.length - 1}
                onClick={() => {
                  const slides = [...working.current.slides];
                  [slides[index], slides[index + 1]] = [
                    slides[index + 1],
                    slides[index],
                  ];
                  save({ ...working.current, slides });
                }}
              >
                <ArrowDown aria-hidden="true" />
              </Button>
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                aria-label={`Remove image ${index + 1}`}
                onClick={() => {
                  if (
                    save({
                      ...working.current,
                      slides: working.current.slides.filter(
                        (item) => item.id !== slide.id,
                      ),
                    })
                  )
                    setDrafts((previous) => {
                      const next = { ...previous };
                      delete next[slide.id];
                      return next;
                    });
                }}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </div>
          </div>
          <ImageUploadInput
            label="Image"
            imageUrl={slide.imageUrl}
            crop={slide.crop}
            uploadImage={uploadImage}
            getFrameAspectRatio={ratio}
            onApply={(source) =>
              save({
                ...working.current,
                slides: working.current.slides.map((item) =>
                  item.id === slide.id ? { ...item, ...source } : item,
                ),
              })
            }
          />
          <TextInput
            label="Alt text"
            value={drafts[slide.id] ?? slide.alt}
            description="Describe the image, or leave empty if decorative."
            onChange={(event) => {
              const value = event.currentTarget.value;
              setDrafts((previous) => ({ ...previous, [slide.id]: value }));
            }}
            onBlur={() => {
              const value = drafts[slide.id];
              if (value === undefined) return;
              if (
                save({
                  ...working.current,
                  slides: working.current.slides.map((item) =>
                    item.id === slide.id ? { ...item, alt: value } : item,
                  ),
                })
              )
                setDrafts((previous) => {
                  const next = { ...previous };
                  delete next[slide.id];
                  return next;
                });
            }}
          />
        </div>
      ))}
      <ImageUploadInput
        label="Add image"
        imageUrl=""
        crop={null}
        uploadImage={uploadImage}
        getFrameAspectRatio={ratio}
        onApply={(source) =>
          save({
            ...working.current,
            slides: [
              ...working.current.slides,
              { id: crypto.randomUUID(), ...source, alt: "" },
            ],
          })
        }
      />
      {error === undefined ? null : <FieldError>{error}</FieldError>}
      {pending === null ? null : (
        <Button
          type="button"
          variant="outline"
          onClick={() => save(working.current)}
        >
          Retry save
        </Button>
      )}
    </FieldGroup>
  );
}
