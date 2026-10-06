import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { primitiveInputsMap, ShapeForm } from '@zerospin/react/primitives';
import {
  makeTable,
  PrimitiveKind,
  primitives,
  type InferDecodedRow,
} from '@zerospin/shapes';
import { Effect, Schema, SchemaGetter, SchemaIssue } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(cleanup);

const numericTable = makeTable({
  name: 'counter',
  shape: { id: primitives.integer({ primaryKey: true }) },
});
const stringTable = makeTable({
  name: 'member',
  shape: { id: primitives.primaryKey({ abbreviation: 'mem' }) },
});
const shape = {
  enabled: primitives.boolean(),
  cursor: primitives.cursor({ abbreviation: 'cur' }),
  createdAt: primitives.date(),
  state: primitives.enum({ values: ['open', 'closed'] }),
  count: primitives.integer(),
  data: primitives.json({ schema: Schema.Struct({ count: Schema.Number }) }),
  amount: primitives.number(),
  foreignId: primitives.foreignKey({ abbreviation: 'ext' }),
  id: primitives.primaryKey({ abbreviation: 'itm' }),
  memberId: primitives.ref({
    table: stringTable,
    relation: 'member',
    inverse: 'items',
  }),
  label: primitives.text(),
  counterId: primitives.ref({
    table: numericTable,
    relation: 'counter',
    inverse: 'items',
  }),
};
const defaultValues: InferDecodedRow<typeof shape> = {
  enabled: true,
  cursor: 'cur_one',
  createdAt: new Date('2026-10-03T12:30:40.123Z'),
  state: 'open',
  count: 1,
  data: { count: 1 },
  amount: 12.5,
  foreignId: 'ext_one',
  id: 'itm_one',
  memberId: 'mem_one',
  label: 'First',
  counterId: 4,
};

async function ready() {
  return screen.findByRole('button', { name: 'Submit' });
}

describe('ShapeForm public entrypoint', () => {
  it('renders partial defaults as blank editable drafts and validates the complete row on submit', async () => {
    const onSubmit = vi.fn();
    render(
      <ShapeForm
        shape={shape}
        defaultValues={{ label: 'Partial' }}
        onSubmit={onSubmit}
      />,
    );
    await ready();
    const blankFields = [
      'cursor',
      'createdAt',
      'count',
      'amount',
      'foreignId',
      'id',
      'memberId',
      'counterId',
    ];
    for (const name of blankFields) {
      expect(screen.getByRole('textbox', { name }).getAttribute('value')).toBe(
        '',
      );
    }
    expect(screen.getByRole('textbox', { name: 'data' }).textContent).toBe('');
    expect(
      screen.getByRole('combobox', { name: 'state' }).textContent,
    ).not.toContain('open');
    expect(
      screen
        .getByRole('checkbox', { name: 'enabled' })
        .getAttribute('aria-checked'),
    ).toBe('false');
    expect(screen.queryAllByRole('alert')).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(10));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(
      screen.getByRole('textbox', { name: 'label' }).getAttribute('value'),
    ).toBe('Partial');
    for (const [name, value] of Object.entries({
      cursor: defaultValues.cursor,
      createdAt: defaultValues.createdAt.toISOString(),
      count: String(defaultValues.count),
      data: JSON.stringify(defaultValues.data),
      amount: String(defaultValues.amount),
      foreignId: defaultValues.foreignId,
      id: defaultValues.id,
      memberId: defaultValues.memberId,
      counterId: String(defaultValues.counterId),
    })) {
      fireEvent.change(screen.getByRole('textbox', { name }), {
        target: { value },
      });
    }
    await userEvent.click(screen.getByRole('checkbox', { name: 'enabled' }));
    await userEvent.click(screen.getByRole('combobox', { name: 'state' }));
    await userEvent.click(await screen.findByRole('option', { name: 'open' }));
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        ...defaultValues,
        label: 'Partial',
      }),
    );
  });

  it('applies descriptor defaults while preserving explicit falsy and null values', async () => {
    const date = new Date('2026-10-03T12:30:40.123Z');
    const onSubmit = vi.fn();
    render(
      <ShapeForm
        shape={{
          enabled: primitives.boolean({ defaultValue: true }),
          count: primitives.integer({ defaultValue: 0 }),
          amount: primitives.number({ defaultValue: 12 }),
          label: primitives.text({ defaultValue: 'Initial' }),
          note: primitives.text({ nullable: true, defaultValue: 'Initial' }),
          empty: primitives.text({ defaultValue: '' }),
          date: primitives.date({ defaultValue: date }),
          state: primitives.enum({
            values: ['open', 'closed'],
            defaultValue: 'closed',
          }),
          data: primitives.json({
            nullable: true,
            defaultValue: null,
            schema: Schema.Struct({ count: Schema.Number }),
          }),
        }}
        defaultValues={{ enabled: false, amount: 0, label: '', note: null }}
        onSubmit={onSubmit}
      />,
    );
    await ready();
    expect(
      screen.getByRole('textbox', { name: 'date' }).getAttribute('value'),
    ).toBe(date.toISOString());
    expect(
      screen.getByRole('textbox', { name: 'count' }).getAttribute('value'),
    ).toBe('0');
    expect(
      screen.getByRole('combobox', { name: 'state' }).textContent,
    ).toContain('closed');
    expect(
      screen.getByRole('textbox', { name: 'data' }).hasAttribute('disabled'),
    ).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        enabled: false,
        count: 0,
        amount: 0,
        label: '',
        note: null,
        empty: '',
        date,
        state: 'closed',
        data: null,
      }),
    );
  });

  it('submits an empty shape without defaults', async () => {
    const onSubmit = vi.fn();
    render(<ShapeForm shape={{}} onSubmit={onSubmit} />);
    await userEvent.click(await ready());
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({}));
  });

  it('does not treat inherited prototype properties as provided defaults', async () => {
    const onSubmit = vi.fn();
    render(
      <ShapeForm
        shape={{
          constructor: primitives.text(),
          toString: primitives.text(),
          valueOf: primitives.text(),
        }}
        defaultValues={{}}
        onSubmit={onSubmit}
      />,
    );
    const submit = await ready();
    for (const name of ['constructor', 'toString', 'valueOf']) {
      expect(screen.getByRole('textbox', { name }).getAttribute('value')).toBe(
        '',
      );
    }
    await userEvent.click(submit);
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        constructor: '',
        toString: '',
        valueOf: '',
      }),
    );
  });

  it('maps every primitive and submits complete decoded values', async () => {
    const onSubmit = vi.fn();
    render(
      <ShapeForm
        shape={shape}
        defaultValues={defaultValues}
        onSubmit={onSubmit}
      />,
    );
    const submit = await ready();
    expect(Object.keys(primitiveInputsMap).sort()).toEqual(
      Object.values(PrimitiveKind).sort(),
    );
    expect(
      screen
        .getByRole('checkbox', { name: 'enabled' })
        .getAttribute('aria-checked'),
    ).toBe('true');
    expect(
      screen.getByRole('combobox', { name: 'state' }).textContent,
    ).toContain('open');
    expect(screen.getByRole('textbox', { name: 'data' }).tagName).toBe(
      'TEXTAREA',
    );
    for (const name of [
      'cursor',
      'createdAt',
      'count',
      'amount',
      'foreignId',
      'id',
      'memberId',
      'label',
      'counterId',
    ]) {
      expect(screen.getByRole('textbox', { name }).getAttribute('type')).toBe(
        'text',
      );
    }
    await userEvent.click(submit);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(defaultValues));
  });

  it('edits controls while retaining codec acceptance of fractional integer values and non-finite numbers', async () => {
    const onSubmit = vi.fn();
    render(
      <ShapeForm
        shape={shape}
        defaultValues={defaultValues}
        onSubmit={onSubmit}
      />,
    );
    await ready();
    fireEvent.change(screen.getByRole('textbox', { name: 'count' }), {
      target: { value: '2.5' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'amount' }), {
      target: { value: 'Infinity' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'counterId' }), {
      target: { value: '4.5' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'data' }), {
      target: { value: '{"count":2}' },
    });
    await userEvent.click(screen.getByRole('checkbox', { name: 'enabled' }));
    await userEvent.click(screen.getByRole('combobox', { name: 'state' }));
    await userEvent.click(
      await screen.findByRole('option', { name: 'closed' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        ...defaultValues,
        count: 2.5,
        amount: Infinity,
        counterId: 4.5,
        enabled: false,
        state: 'closed',
        data: { count: 2 },
      }),
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'amount' }), {
      target: { value: 'NaN' },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit.mock.calls[1]?.[0].amount).toBeNaN();
  });

  it('keeps null separate from empty drafts and restores edits after null is toggled', async () => {
    const nullableShape = {
      label: primitives.text({ nullable: true }),
      enabled: primitives.boolean({ nullable: true }),
      amount: primitives.number({ nullable: true }),
      data: primitives.json({
        nullable: true,
        schema: Schema.Struct({ count: Schema.Number }),
      }),
      state: primitives.enum({ nullable: true, values: ['open', 'closed'] }),
    };
    const onSubmit = vi.fn();
    render(
      <ShapeForm
        shape={nullableShape}
        defaultValues={{
          label: null,
          enabled: false,
          amount: null,
          data: null,
          state: null,
        }}
        onSubmit={onSubmit}
      />,
    );
    await ready();
    const label = screen.getByRole('textbox', { name: 'label' });
    expect(label.hasAttribute('disabled')).toBe(true);
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'label: null' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenLastCalledWith({
        label: '',
        enabled: false,
        amount: null,
        data: null,
        state: null,
      }),
    );
    fireEvent.change(label, { target: { value: 'Preserved' } });
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'label: null' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenLastCalledWith({
        label: null,
        enabled: false,
        amount: null,
        data: null,
        state: null,
      }),
    );
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'label: null' }),
    );
    expect(label.getAttribute('value')).toBe('Preserved');
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'state: null' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenLastCalledWith({
        label: 'Preserved',
        enabled: false,
        amount: null,
        data: null,
        state: 'open',
      }),
    );
  });

  it('keeps a JSON null draft distinct from the explicit nullable value', async () => {
    const onSubmit = vi.fn();
    render(
      <ShapeForm
        shape={{
          data: primitives.json({
            nullable: true,
            schema: Schema.Struct({ count: Schema.Number }),
          }),
        }}
        defaultValues={{ data: null }}
        onSubmit={onSubmit}
      />,
    );
    await ready();
    await userEvent.click(screen.getByRole('checkbox', { name: 'data: null' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'data' }), {
      target: { value: 'null' },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await screen.findByRole('alert');
    expect(onSubmit).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('checkbox', { name: 'data: null' }));
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ data: null }));
  });

  it('preserves negative zero defaults', async () => {
    const onSubmit = vi.fn();
    render(
      <ShapeForm
        shape={{ value: primitives.number() }}
        defaultValues={{ value: -0 }}
        onSubmit={onSubmit}
      />,
    );
    await ready();
    expect(
      screen.getByRole('textbox', { name: 'value' }).getAttribute('value'),
    ).toBe('-0');
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ value: -0 }));
  });

  it('shows normalization and codec errors together, retains drafts, and accepts corrected values', async () => {
    const onSubmit = vi.fn();
    render(
      <ShapeForm
        shape={shape}
        defaultValues={defaultValues}
        onSubmit={onSubmit}
      />,
    );
    await ready();
    for (const [name, value] of Object.entries({
      count: '-',
      amount: '1e',
      createdAt: '2026-10-03',
      data: '{',
      id: 'wrong',
      memberId: 'wrong',
      counterId: '',
    })) {
      fireEvent.change(screen.getByRole('textbox', { name }), {
        target: { value },
      });
    }
    expect(screen.queryAllByRole('alert')).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(7));
    expect(onSubmit).not.toHaveBeenCalled();
    for (const name of [
      'count',
      'amount',
      'createdAt',
      'data',
      'id',
      'memberId',
      'counterId',
    ]) {
      expect(
        screen.getByRole('textbox', { name }).getAttribute('aria-invalid'),
      ).toBe('true');
    }
    expect(
      screen.getByRole('textbox', { name: 'count' }).getAttribute('value'),
    ).toBe('-');
    for (const [name, value] of Object.entries({
      count: '2',
      amount: '.5',
      createdAt: '2026-10-03T12:30:40.123Z',
      data: '{"count":2}',
      id: 'itm_two',
      memberId: 'mem_two',
      counterId: '2',
    })) {
      fireEvent.change(screen.getByRole('textbox', { name }), {
        target: { value },
      });
    }
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(screen.queryAllByRole('alert')).toHaveLength(0);
  });

  it.each(['', '.', '-', '+', '1.', '1e', '1e+', '1junk'])(
    'rejects incomplete numeric spelling %j',
    async value => {
      const onSubmit = vi.fn();
      render(
        <ShapeForm
          shape={{ amount: primitives.number() }}
          defaultValues={{ amount: 1 }}
          onSubmit={onSubmit}
        />,
      );
      await ready();
      fireEvent.change(screen.getByRole('textbox', { name: 'amount' }), {
        target: { value },
      });
      await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
      expect((await screen.findByRole('alert')).textContent).toContain(
        'Enter a complete number',
      );
      expect(onSubmit).not.toHaveBeenCalled();
    },
  );

  it.each(['', '2026-10-03', '2026-10-03T12:', '2026-02-30T12:30:00.000Z'])(
    'rejects incomplete or invalid timestamps %j',
    async value => {
      const onSubmit = vi.fn();
      render(
        <ShapeForm
          shape={{ date: primitives.date() }}
          defaultValues={{ date: defaultValues.createdAt }}
          onSubmit={onSubmit}
        />,
      );
      await ready();
      fireEvent.change(screen.getByRole('textbox', { name: 'date' }), {
        target: { value },
      });
      await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
      expect((await screen.findByRole('alert')).textContent).toContain(
        'Enter a complete ISO timestamp',
      );
      expect(onSubmit).not.toHaveBeenCalled();
    },
  );

  it('preserves extended-year dates and field names containing dots', async () => {
    const onSubmit = vi.fn();
    const date = new Date('+010000-10-03T12:30:40.123Z');
    render(
      <ShapeForm
        shape={{ 'event.date': primitives.date() }}
        defaultValues={{ 'event.date': date }}
        onSubmit={onSubmit}
      />,
    );
    await ready();
    expect(
      screen.getByRole('textbox', { name: 'event.date' }).getAttribute('value'),
    ).toBe(date.toISOString());
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ 'event.date': date }),
    );
  });

  it.each([
    '2026-10-03T12:30:40Z',
    '2026-10-03T07:30:40-05:00',
    '2026-10-03T12:30:40.1Z',
    '2026-10-03T24:00:00Z',
  ])(
    'accepts complete ISO spelling %j without dropping its instant',
    async value => {
      const onSubmit = vi.fn();
      render(
        <ShapeForm
          shape={{ date: primitives.date() }}
          defaultValues={{ date: defaultValues.createdAt }}
          onSubmit={onSubmit}
        />,
      );
      await ready();
      fireEvent.change(screen.getByRole('textbox', { name: 'date' }), {
        target: { value },
      });
      await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
      await waitFor(() =>
        expect(onSubmit).toHaveBeenCalledWith({ date: new Date(value) }),
      );
    },
  );

  it('uses asynchronous JSON codecs for encoding defaults, validation, and decoded submission', async () => {
    const encode = vi.fn((value: number) => Promise.resolve(String(value)));
    const decode = vi.fn((value: string) => Promise.resolve(Number(value)));
    const codec = Schema.String.pipe(
      Schema.decodeTo(Schema.Number, {
        encode: SchemaGetter.transformOrFail(value =>
          Effect.promise(() => encode(value)),
        ),
        decode: SchemaGetter.transformOrFail(value =>
          value === 'invalid'
            ? Effect.fail(
                new SchemaIssue.InvalidValue(
                  { expected: 'a numeric string' },
                  value,
                ),
              )
            : Effect.promise(() => decode(value)),
        ),
      }),
    );
    const onSubmit = vi.fn();
    render(
      <ShapeForm
        shape={{
          data: primitives.json({ schema: codec }),
          label: primitives.text({ defaultValue: 'New' }),
        }}
        defaultValues={{ data: 42 }}
        onSubmit={onSubmit}
      />,
    );
    await ready();
    expect(screen.getByRole('textbox', { name: 'data' }).textContent).toBe(
      '"42"',
    );
    expect(encode).toHaveBeenCalledWith(42);
    fireEvent.change(screen.getByRole('textbox', { name: 'data' }), {
      target: { value: '"invalid"' },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'a numeric string',
    );
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('textbox', { name: 'data' }), {
      target: { value: '"73"' },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ data: 73, label: 'New' }),
    );
    expect(decode).toHaveBeenCalledWith('73');
  });

  it('disables every control and programmatic submission while preserving drafts for re-enabling', async () => {
    const onSubmit = vi.fn();
    const nullableShape = {
      label: primitives.text({ nullable: true }),
      enabled: primitives.boolean(),
      state: primitives.enum({ values: ['open', 'closed'] }),
      data: primitives.json({
        schema: Schema.Struct({ count: Schema.Number }),
      }),
    };
    const initialValues: InferDecodedRow<typeof nullableShape> = {
      label: 'First',
      enabled: true,
      state: 'open',
      data: { count: 1 },
    };
    const { rerender } = render(
      <ShapeForm
        shape={nullableShape}
        defaultValues={initialValues}
        onSubmit={onSubmit}
      />,
    );
    const submit = await ready();
    fireEvent.change(screen.getByRole('textbox', { name: 'label' }), {
      target: { value: 'Edited' },
    });
    rerender(
      <ShapeForm
        shape={nullableShape}
        disabled
        defaultValues={initialValues}
        onSubmit={onSubmit}
      />,
    );
    for (const element of [
      ...screen.getAllByRole('textbox'),
      ...screen.getAllByRole('combobox'),
      submit,
    ]) {
      expect(element.hasAttribute('disabled')).toBe(true);
    }
    for (const checkbox of screen.getAllByRole('checkbox')) {
      expect(checkbox.getAttribute('aria-disabled')).toBe('true');
      const checked = checkbox.getAttribute('aria-checked');
      await userEvent.click(checkbox);
      expect(checkbox.getAttribute('aria-checked')).toBe(checked);
    }
    const form = submit.closest('form');
    if (!form) throw new Error('Missing form');
    await act(async () => fireEvent.submit(form));
    expect(onSubmit).not.toHaveBeenCalled();
    rerender(
      <ShapeForm
        shape={nullableShape}
        defaultValues={initialValues}
        onSubmit={onSubmit}
      />,
    );
    expect(
      screen.getByRole('textbox', { name: 'label' }).getAttribute('value'),
    ).toBe('Edited');
    await userEvent.click(submit);
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        ...initialValues,
        label: 'Edited',
      }),
    );
  });

  it.each([1, 2])(
    'does not call onSubmit if disabled becomes true during asynchronous decoding pass %s',
    async decodingPass => {
      let finishDecode: (() => void) | undefined;
      let decodeCalls = 0;
      const decode = vi.fn((value: string) => {
        decodeCalls += 1;
        return decodeCalls === decodingPass
          ? new Promise<number>(resolve => {
              finishDecode = () => resolve(Number(value));
            })
          : Promise.resolve(Number(value));
      });
      const codec = Schema.String.pipe(
        Schema.decodeTo(Schema.Number, {
          encode: SchemaGetter.transform(String),
          decode: SchemaGetter.transformOrFail(value =>
            Effect.promise(() => decode(value)),
          ),
        }),
      );
      const jsonShape = { data: primitives.json({ schema: codec }) };
      const onSubmit = vi.fn();
      const { rerender } = render(
        <ShapeForm
          shape={jsonShape}
          defaultValues={{ data: 42 }}
          onSubmit={onSubmit}
        />,
      );
      const submit = await ready();
      fireEvent.change(screen.getByRole('textbox', { name: 'data' }), {
        target: { value: '"73"' },
      });
      const form = submit.closest('form');
      if (!form) throw new Error('Missing form');
      fireEvent.submit(form);
      await waitFor(() => expect(decode).toHaveBeenCalledTimes(decodingPass));
      rerender(<ShapeForm shape={jsonShape} disabled onSubmit={onSubmit} />);
      await act(async () => finishDecode?.());
      await ready();
      expect(onSubmit).not.toHaveBeenCalled();
      expect(screen.getByRole('textbox', { name: 'data' }).textContent).toBe(
        '"73"',
      );
      rerender(<ShapeForm shape={jsonShape} onSubmit={onSubmit} />);
      await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
      await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ data: 73 }));
    },
  );

  it.each([
    { decodingPass: 1, lifetimeEnd: 'unmount' },
    { decodingPass: 2, lifetimeEnd: 'unmount' },
    { decodingPass: 1, lifetimeEnd: 'replacement' },
    { decodingPass: 2, lifetimeEnd: 'replacement' },
  ])(
    'does not submit the previous form after $lifetimeEnd during decoding pass $decodingPass',
    async ({ decodingPass, lifetimeEnd }) => {
      let finishDecode: (() => void) | undefined;
      let decodeCalls = 0;
      const decode = vi.fn((value: string) => {
        decodeCalls += 1;
        return decodeCalls === decodingPass
          ? new Promise<number>(resolve => {
              finishDecode = () => resolve(Number(value));
            })
          : Promise.resolve(Number(value));
      });
      const codec = Schema.String.pipe(
        Schema.decodeTo(Schema.Number, {
          encode: SchemaGetter.transform(String),
          decode: SchemaGetter.transformOrFail(value =>
            Effect.promise(() => decode(value)),
          ),
        }),
      );
      const jsonShape = { data: primitives.json({ schema: codec }) };
      const onSubmit = vi.fn();
      const replacementSubmit = vi.fn();
      const { rerender, unmount } = render(
        <ShapeForm
          key="first"
          shape={jsonShape}
          defaultValues={{ data: 42 }}
          onSubmit={onSubmit}
        />,
      );
      const form = (await ready()).closest('form');
      if (!form) throw new Error('Missing form');
      fireEvent.submit(form);
      await waitFor(() => expect(decode).toHaveBeenCalledTimes(decodingPass));
      if (lifetimeEnd === 'unmount') {
        unmount();
      } else {
        rerender(
          <ShapeForm key="second" shape={{}} onSubmit={replacementSubmit} />,
        );
        await ready();
      }
      await act(async () => finishDecode?.());
      expect(onSubmit).not.toHaveBeenCalled();
      if (lifetimeEnd === 'replacement') {
        await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
        await waitFor(() => expect(replacementSubmit).toHaveBeenCalledWith({}));
        expect(onSubmit).not.toHaveBeenCalled();
      }
    },
  );

  it('blocks duplicate submissions, displays submission failures, and preserves edits for retry', async () => {
    let rejectSubmission: ((error: Error) => void) | undefined;
    const onSubmit = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((_resolve, reject) => {
            rejectSubmission = reject;
          }),
      )
      .mockResolvedValueOnce(undefined);
    render(
      <ShapeForm
        shape={{ label: primitives.text() }}
        defaultValues={{ label: 'First' }}
        onSubmit={onSubmit}
      />,
    );
    const submit = await ready();
    fireEvent.change(screen.getByRole('textbox', { name: 'label' }), {
      target: { value: 'Edited' },
    });
    const form = submit.closest('form');
    if (!form) throw new Error('Missing form');
    fireEvent.submit(form);
    fireEvent.submit(form);
    await screen.findByRole('button', { name: 'Submitting…' });
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    fireEvent.submit(form);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('textbox', { name: 'label' }).hasAttribute('disabled'),
    ).toBe(true);
    await act(async () => rejectSubmission?.(new Error('Try again')));
    expect((await screen.findByRole('alert')).textContent).toBe('Try again');
    expect(
      screen.getByRole('textbox', { name: 'label' }).getAttribute('value'),
    ).toBe('Edited');
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit).toHaveBeenLastCalledWith({ label: 'Edited' });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('treats defaults as initial values and resets on key remount', async () => {
    const textShape = { label: primitives.text() };
    const onSubmit = vi.fn();
    const { rerender } = render(
      <ShapeForm
        key="first"
        shape={textShape}
        defaultValues={{ label: 'First' }}
        onSubmit={onSubmit}
      />,
    );
    await ready();
    fireEvent.change(screen.getByRole('textbox', { name: 'label' }), {
      target: { value: 'Edited' },
    });
    rerender(
      <ShapeForm
        key="first"
        shape={textShape}
        defaultValues={{ label: 'Second' }}
        onSubmit={onSubmit}
      />,
    );
    expect(
      screen.getByRole('textbox', { name: 'label' }).getAttribute('value'),
    ).toBe('Edited');
    rerender(
      <ShapeForm
        key="second"
        shape={textShape}
        defaultValues={{ label: 'Second' }}
        onSubmit={onSubmit}
      />,
    );
    await ready();
    expect(
      screen.getByRole('textbox', { name: 'label' }).getAttribute('value'),
    ).toBe('Second');
  });

  it('shows initialization errors and can recover through a key remount', async () => {
    const dateShape = { date: primitives.date() };
    const onSubmit = vi.fn();
    const { rerender } = render(
      <ShapeForm
        key="invalid"
        shape={dateShape}
        defaultValues={{ date: new Date('invalid') }}
        onSubmit={onSubmit}
      />,
    );
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Expected a valid Date',
    );
    expect(screen.queryByRole('button')).toBeNull();
    rerender(
      <ShapeForm
        key="valid"
        shape={dateShape}
        defaultValues={{ date: defaultValues.createdAt }}
        onSubmit={onSubmit}
      />,
    );
    await ready();
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ date: defaultValues.createdAt }),
    );
  });
});
