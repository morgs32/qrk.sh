"use client";

import { useId } from "react";

import { Input } from "../../components/ui/input";

export function ImageForm(props: {
  state: { imageUrl: string; title: string };
  onChange: (state: { imageUrl: string; title: string }) => void;
}) {
  const { state, onChange } = props;
  const inputId = useId();

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-col gap-2">
        <label className="font-medium" htmlFor={`${inputId}-image-url`}>
          Image URL
        </label>
        <Input
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect="off"
          id={`${inputId}-image-url`}
          onChange={(event) => onChange({ ...state, imageUrl: event.target.value })}
          placeholder="https://example.com/image.jpg"
          spellCheck={false}
          type="url"
          value={state.imageUrl}
        />
      </div>
      <div className="flex flex-col gap-2">
        <label className="font-medium" htmlFor={`${inputId}-title`}>
          Title
        </label>
        <Input
          id={`${inputId}-title`}
          onChange={(event) => onChange({ ...state, title: event.target.value })}
          type="text"
          value={state.title}
        />
      </div>
    </div>
  );
}
