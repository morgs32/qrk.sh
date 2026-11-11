import { type ComponentProps, useId } from "react";

import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "./field";
import { Input } from "./Input";

export function TextInput(
  props: ComponentProps<typeof Input> & {
    label: string;
    description?: string;
    error?: string;
    status?: string;
  },
) {
  const {
    label,
    description,
    error,
    status,
    id,
    "aria-describedby": describedBy,
    ...inputProps
  } = props;
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const descriptionId = description === undefined ? undefined : `${inputId}-description`;
  const errorId = error === undefined ? undefined : `${inputId}-error`;

  return (
    <Field orientation="horizontal" data-invalid={inputProps["aria-invalid"] || undefined}>
      <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
      <FieldContent>
        <Input
          {...inputProps}
          id={inputId}
          aria-describedby={
            [describedBy, descriptionId, errorId].filter(Boolean).join(" ") || undefined
          }
        />
        {description === undefined ? null : (
          <FieldDescription id={descriptionId}>{description}</FieldDescription>
        )}
        {error === undefined ? null : <FieldError id={errorId}>{error}</FieldError>}
        {status === undefined ? null : <FieldDescription role="status">{status}</FieldDescription>}
      </FieldContent>
    </Field>
  );
}
