import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

import * as stylex from '@stylexjs/stylex';
import {
  useForm,
  type StandardSchemaV1,
  type StandardSchemaV1Issue,
} from '@tanstack/react-form';
import {
  descriptorToEffectSchema,
  makeEffectSchema,
  PrimitiveKind,
  type IAnyPrimitiveDescriptor,
  type IAnyShape,
  type InferDecodedRow,
} from '@zerospin/shapes';
import { Schema } from 'effect';

import { Button } from './button.js';
import { Checkbox } from './checkbox.js';
import { primitiveInputsMap } from './primitiveInputsMap.js';
import { colors } from './tokens.stylex.js';

export type IShapeFormProps<SHAPE extends IAnyShape> = {
  shape: SHAPE;
  defaultValues?: Partial<InferDecodedRow<SHAPE>>;
  disabled?: boolean;
  onSubmit: (value: InferDecodedRow<SHAPE>) => void | Promise<void>;
};

type IPrimitiveDraft = { value: string | boolean; isNull: boolean };
type IDraftRow = { fields: IPrimitiveDraft[] };
type IShapeField = { name: string; descriptor: IAnyPrimitiveDescriptor };

const styles = stylex.create({
  form: {
    display: 'grid',
    gap: '1rem',
    color: colors.foreground,
    width: '100%',
  },
  fields: {
    borderWidth: 0,
    margin: 0,
    minWidth: 0,
    padding: 0,
    display: 'grid',
    gap: '1rem',
  },
  field: { display: 'grid', gap: '0.375rem', minWidth: 0 },
  label: { fontSize: '0.875rem', fontWeight: 500 },
  nullable: {
    alignItems: 'center',
    display: 'flex',
    gap: '0.5rem',
    fontSize: '0.875rem',
  },
  errors: {
    color: colors.destructive,
    fontSize: '0.875rem',
    listStyle: 'none',
    margin: 0,
    padding: 0,
  },
});

function errorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }
  return 'Unable to submit this form';
}

function formErrorMessages(error: unknown): string[] {
  if (typeof error === 'string') return [error];
  if (
    typeof error === 'object' &&
    error !== null &&
    '' in error &&
    Array.isArray(error[''])
  ) {
    return error[''].map(errorMessage);
  }
  return [];
}

async function makeInitialDrafts<SHAPE extends IAnyShape>(
  fields: IShapeField[],
  defaultValues: IShapeFormProps<SHAPE>['defaultValues'],
): Promise<IDraftRow> {
  return {
    fields: await Promise.all(
      fields.map(async ({ name, descriptor }) => {
        const initialValue: unknown =
          defaultValues && Object.hasOwn(defaultValues, name)
            ? defaultValues[name]
            : undefined;
        const decoded =
          initialValue === undefined && 'defaultValue' in descriptor
            ? descriptor.defaultValue
            : initialValue;
        if (decoded === undefined) {
          return {
            value: descriptor.kind === PrimitiveKind.Boolean ? false : '',
            isNull: false,
          };
        }
        const value = await Schema.encodePromise(
          descriptorToEffectSchema(descriptor),
        )(decoded, { errors: 'all' });
        if (value === null) {
          return {
            isNull: true,
            value:
              descriptor.kind === PrimitiveKind.Boolean
                ? false
                : descriptor.kind === PrimitiveKind.Enum
                  ? descriptor.values[0]
                  : '',
          };
        }
        if (value instanceof Date) {
          return { value: value.toISOString(), isNull: false };
        }
        if (typeof value === 'number') {
          return {
            value: Object.is(value, -0) ? '-0' : String(value),
            isNull: false,
          };
        }
        if (typeof value === 'string' || typeof value === 'boolean') {
          return { value, isNull: false };
        }
        throw new Error(`Unable to encode initial value for ${name}`);
      }),
    ),
  };
}

function isDraftRow(value: unknown): value is IDraftRow {
  return (
    typeof value === 'object' &&
    value !== null &&
    'fields' in value &&
    Array.isArray(value.fields) &&
    value.fields.every(
      field =>
        typeof field === 'object' &&
        field !== null &&
        'value' in field &&
        (typeof field.value === 'string' || typeof field.value === 'boolean') &&
        'isNull' in field &&
        typeof field.isNull === 'boolean',
    )
  );
}

function parseDateDraft(value: string): Date | undefined {
  const match =
    /^([+-]\d{6}|\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    );
  if (!match) return undefined;
  const [
    ,
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
    fraction,
  ] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const millisecond = Number(fraction?.padEnd(3, '0') ?? '0');
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ][month - 1];
  if (
    !daysInMonth ||
    day < 1 ||
    day > daysInMonth ||
    hour > 24 ||
    minute > 59 ||
    second > 59 ||
    (hour === 24 && (minute !== 0 || second !== 0 || millisecond !== 0))
  ) {
    return undefined;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function normalizeDrafts(fields: IShapeField[], drafts: IDraftRow) {
  const issues: StandardSchemaV1Issue[] = [];
  const invalidFields = new Set<number>();
  const candidate = Object.fromEntries(
    fields.map(({ name, descriptor }, index) => {
      const draft = drafts.fields[index];
      if (!draft) throw new Error(`Missing draft for ${name}`);
      if (draft.isNull) return [name, null];
      const { value } = draft;
      if (
        descriptor.kind === PrimitiveKind.Number ||
        descriptor.kind === PrimitiveKind.Integer ||
        (descriptor.kind === PrimitiveKind.Ref &&
          descriptor.targetKind === PrimitiveKind.Integer)
      ) {
        if (
          typeof value === 'string' &&
          (/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(
            value.trim(),
          ) ||
            /^[+-]?Infinity$/.test(value.trim()) ||
            value.trim() === 'NaN')
        ) {
          return [name, Number(value)];
        }
        issues.push({
          message: 'Enter a complete number',
          path: ['fields', index],
        });
        invalidFields.add(index);
      }
      if (descriptor.kind === PrimitiveKind.Date) {
        const date =
          typeof value === 'string' ? parseDateDraft(value) : undefined;
        if (date) return [name, date];
        issues.push({
          message:
            'Enter a complete ISO timestamp, such as 2026-10-03T12:30:00.000Z',
          path: ['fields', index],
        });
        invalidFields.add(index);
      }
      return [name, value];
    }),
  );
  return { candidate, issues, invalidFields };
}

function makeDraftValidator<SHAPE extends IAnyShape>(
  fields: IShapeField[],
  codec: ReturnType<typeof makeEffectSchema<SHAPE>>,
): StandardSchemaV1<IDraftRow, InferDecodedRow<SHAPE>> {
  const schema = Schema.toStandardSchemaV1(codec);
  return {
    '~standard': {
      version: 1,
      vendor: 'zerospin',
      validate: async input => {
        if (!isDraftRow(input) || input.fields.length !== fields.length) {
          return { issues: [{ message: 'Invalid form values' }] };
        }
        const { candidate, issues, invalidFields } = normalizeDrafts(
          fields,
          input,
        );
        const result = await schema['~standard'].validate(candidate);
        if (result.issues) {
          for (const issue of result.issues) {
            const first = issue.path?.[0];
            const name = typeof first === 'object' ? first.key : first;
            const index = fields.findIndex(field => field.name === name);
            if (index < 0) {
              issues.push(issue);
            } else if (!invalidFields.has(index)) {
              issues.push({ ...issue, path: ['fields', index] });
            }
          }
        }
        if (issues.length) return { issues };
        if ('value' in result) return { value: result.value };
        return { issues: [{ message: 'Unable to validate this form' }] };
      },
    },
  };
}

function ReadyShapeForm<SHAPE extends IAnyShape>(props: {
  fields: IShapeField[];
  codec: ReturnType<typeof makeEffectSchema<SHAPE>>;
  drafts: IDraftRow;
  disabled: boolean;
  onSubmit: IShapeFormProps<SHAPE>['onSubmit'];
}) {
  const { fields, codec, drafts, disabled, onSubmit } = props;
  const id = useId();
  const disabledRef = useRef(disabled);
  const mountedRef = useRef(true);
  disabledRef.current = disabled;
  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const [validator] = useState(() => makeDraftValidator(fields, codec));
  const form = useForm({
    defaultValues: drafts,
    validators: { onSubmitAsync: validator },
    onSubmit: async ({ value }) => {
      if (!mountedRef.current || disabledRef.current) return;
      const { candidate } = normalizeDrafts(fields, value);
      const decoded = await Schema.decodeUnknownPromise(codec)(candidate, {
        errors: 'all',
      });
      if (mountedRef.current && !disabledRef.current) await onSubmit(decoded);
    },
  });

  return (
    <form
      {...stylex.props(styles.form)}
      noValidate
      onSubmit={event => {
        event.preventDefault();
        event.stopPropagation();
        if (
          mountedRef.current &&
          !disabledRef.current &&
          !form.state.isSubmitting
        ) {
          void form.handleSubmit().catch(error => {
            if (!mountedRef.current) return;
            form.setErrorMap({
              onSubmit: { form: errorMessage(error), fields: {} },
            });
          });
        }
      }}
    >
      <form.Subscribe selector={state => state.isSubmitting}>
        {isSubmitting => (
          <fieldset
            disabled={disabled || isSubmitting}
            {...stylex.props(styles.fields)}
          >
            {fields.map(({ name, descriptor }, index) => (
              <form.Field key={name} name={`fields[${index}]`}>
                {field => (
                  <ShapeInputs
                    name={name}
                    descriptor={descriptor}
                    id={`${id}-${index}`}
                    draft={field.state.value}
                    errors={field.state.meta.errors.map(errorMessage)}
                    disabled={disabled || isSubmitting}
                    onBlur={field.handleBlur}
                    onChange={field.handleChange}
                  />
                )}
              </form.Field>
            ))}
          </fieldset>
        )}
      </form.Subscribe>
      <form.Subscribe
        selector={state => [state.isSubmitting, state.errors] as const}
      >
        {([isSubmitting, errors]) => (
          <>
            {errors.flatMap(formErrorMessages).map((error, index) => (
              <p key={index} role="alert" {...stylex.props(styles.errors)}>
                {errorMessage(error)}
              </p>
            ))}
            <Button type="submit" disabled={disabled || isSubmitting}>
              {isSubmitting ? 'Submitting…' : 'Submit'}
            </Button>
          </>
        )}
      </form.Subscribe>
    </form>
  );
}

function ShapeInputs(props: {
  name: string;
  descriptor: IAnyPrimitiveDescriptor;
  id: string;
  draft: IPrimitiveDraft;
  errors: string[];
  disabled: boolean;
  onBlur: () => void;
  onChange: (draft: IPrimitiveDraft) => void;
}) {
  const { name, descriptor, id, draft, errors, disabled, onBlur, onChange } =
    props;
  const Input = primitiveInputsMap[descriptor.kind];
  return (
    <div {...stylex.props(styles.field)}>
      <label htmlFor={id} {...stylex.props(styles.label)}>
        {name}
      </label>
      <Input
        descriptor={descriptor}
        id={id}
        name={name}
        value={draft.value}
        disabled={disabled || draft.isNull}
        invalid={errors.length > 0}
        describedBy={errors.length ? `${id}-errors` : undefined}
        onBlur={onBlur}
        onChange={value => onChange({ ...draft, value })}
      />
      {descriptor.nullable && (
        <div {...stylex.props(styles.nullable)}>
          <Checkbox
            id={`${id}-null`}
            checked={draft.isNull}
            disabled={disabled}
            onBlur={onBlur}
            onCheckedChange={isNull => onChange({ ...draft, isNull })}
          />
          <label htmlFor={`${id}-null`}>{name}: null</label>
        </div>
      )}
      {errors.length > 0 && (
        <ul id={`${id}-errors`} role="alert" {...stylex.props(styles.errors)}>
          {errors.map((message, index) => (
            <li key={index}>{message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ShapeForm<SHAPE extends IAnyShape>(
  props: IShapeFormProps<SHAPE>,
) {
  const { shape, defaultValues, disabled = false, onSubmit } = props;
  const [initial] = useState(() => ({
    codec: makeEffectSchema(shape),
    fields: Object.entries(shape).map(([name, descriptor]) => ({
      name,
      descriptor,
    })),
    defaultValues,
  }));
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'ready'; drafts: IDraftRow }
    | { status: 'failed'; message: string }
  >({ status: 'loading' });
  useEffect(() => {
    let disposed = false;
    makeInitialDrafts(initial.fields, initial.defaultValues)
      .then(drafts => {
        if (!disposed) setState({ status: 'ready', drafts });
      })
      .catch(error => {
        if (!disposed) {
          setState({ status: 'failed', message: errorMessage(error) });
        }
      });
    return () => {
      disposed = true;
    };
  }, [initial]);

  if (state.status === 'loading') return <p role="status">Preparing form…</p>;
  if (state.status === 'failed') {
    return (
      <p role="alert" {...stylex.props(styles.errors)}>
        {state.message}
      </p>
    );
  }
  return (
    <ReadyShapeForm
      fields={initial.fields}
      codec={initial.codec}
      drafts={state.drafts}
      disabled={disabled}
      onSubmit={onSubmit}
    />
  );
}
