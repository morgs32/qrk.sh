import { PrimitiveKind, type IAnyPrimitiveDescriptor } from '@zerospin/shapes';

import { Checkbox } from './checkbox.js';
import { Input } from './input.js';
import { Select } from './select.js';
import { Textarea } from './textarea.js';

export type IPrimitiveInputProps = {
  descriptor: IAnyPrimitiveDescriptor;
  id: string;
  name: string;
  value: string | boolean;
  disabled: boolean;
  invalid: boolean;
  describedBy: string | undefined;
  onBlur: () => void;
  onChange: (value: string | boolean) => void;
};

function TextInput(props: IPrimitiveInputProps) {
  const { id, name, value, disabled, invalid, describedBy, onBlur, onChange } =
    props;
  return (
    <Input
      id={id}
      name={name}
      type="text"
      value={typeof value === 'string' ? value : ''}
      disabled={disabled}
      aria-invalid={invalid}
      aria-describedby={describedBy}
      onBlur={onBlur}
      onChange={event => onChange(event.currentTarget.value)}
    />
  );
}

function BooleanInput(props: IPrimitiveInputProps) {
  const { id, name, value, disabled, invalid, describedBy, onBlur, onChange } =
    props;
  return (
    <Checkbox
      id={id}
      name={name}
      checked={value === true}
      disabled={disabled}
      aria-invalid={invalid}
      aria-describedby={describedBy}
      onBlur={onBlur}
      onCheckedChange={onChange}
    />
  );
}

function EnumInput(props: IPrimitiveInputProps) {
  const {
    descriptor,
    id,
    name,
    value,
    disabled,
    invalid,
    describedBy,
    onBlur,
    onChange,
  } = props;
  if (descriptor.kind !== PrimitiveKind.Enum) {
    throw new Error('An enum input requires an enum descriptor');
  }
  return (
    <Select
      id={id}
      name={name}
      values={descriptor.values}
      value={typeof value === 'string' ? value : ''}
      disabled={disabled}
      invalid={invalid}
      describedBy={describedBy}
      onBlur={onBlur}
      onChange={onChange}
    />
  );
}

function JsonInput(props: IPrimitiveInputProps) {
  const { id, name, value, disabled, invalid, describedBy, onBlur, onChange } =
    props;
  return (
    <Textarea
      id={id}
      name={name}
      value={typeof value === 'string' ? value : ''}
      disabled={disabled}
      aria-invalid={invalid}
      aria-describedby={describedBy}
      onBlur={onBlur}
      onChange={event => onChange(event.currentTarget.value)}
    />
  );
}

export const primitiveInputsMap = {
  [PrimitiveKind.Boolean]: BooleanInput,
  [PrimitiveKind.Cursor]: TextInput,
  [PrimitiveKind.Date]: TextInput,
  [PrimitiveKind.Enum]: EnumInput,
  [PrimitiveKind.Integer]: TextInput,
  [PrimitiveKind.Json]: JsonInput,
  [PrimitiveKind.Number]: TextInput,
  [PrimitiveKind.ForeignKey]: TextInput,
  [PrimitiveKind.PrimaryKey]: TextInput,
  [PrimitiveKind.Ref]: TextInput,
  [PrimitiveKind.Text]: TextInput,
} satisfies Record<
  PrimitiveKind,
  (props: IPrimitiveInputProps) => React.JSX.Element
>;
