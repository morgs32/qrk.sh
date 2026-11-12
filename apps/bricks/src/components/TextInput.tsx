import { type ComponentProps, type ReactNode, useId } from "react";

import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "./field";
import { Input } from "./Input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "./input-group";

export function TextInput(
  props: ComponentProps<typeof Input> & {
    label: string;
    orientation?: ComponentProps<typeof Field>["orientation"];
    leadingIcon?: ReactNode;
    description?: string;
    error?: string;
    status?: string;
  },
) {
  const {
    label,
    orientation = "horizontal",
    leadingIcon,
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

  const controlProps = {
    ...inputProps,
    id: inputId,
    "aria-describedby":
      [describedBy, descriptionId, errorId].filter(Boolean).join(" ") || undefined,
  };

  return (
    <Field orientation={orientation} data-invalid={inputProps["aria-invalid"] || undefined}>
      <FieldLabel htmlFor={inputId} className={orientation === "vertical" ? "min-h-0" : undefined}>
        {label}
      </FieldLabel>
      <FieldContent>
        {leadingIcon == null ? (
          <Input variant="sm" {...controlProps} />
        ) : (
          <InputGroup variant="sm">
            <InputGroupInput {...controlProps} />
            <InputGroupAddon aria-hidden="true">{leadingIcon}</InputGroupAddon>
          </InputGroup>
        )}
        {description === undefined ? null : (
          <FieldDescription id={descriptionId}>{description}</FieldDescription>
        )}
        {error === undefined ? null : <FieldError id={errorId}>{error}</FieldError>}
        {status === undefined ? null : <FieldDescription role="status">{status}</FieldDescription>}
      </FieldContent>
    </Field>
  );
}
