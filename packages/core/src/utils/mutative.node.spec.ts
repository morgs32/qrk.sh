import { produce } from './mutative.ts';

describe('mutative', () => {
  it('should work', async () => {
    const { patches } = produce.patch<{
      students: Record<string, { id: string; name: string }>;
    }>({ students: {} }, draft => {
      draft.students['1'] = { id: '1', name: 'Alice' };
    });

    expect(patches).toMatchInlineSnapshot(`
      [
        {
          "op": "add",
          "path": [
            "students",
            "1",
          ],
          "value": {
            "id": "1",
            "name": "Alice",
          },
        },
      ]
    `);
    expect(() => {
      produce.applyPatches({}, patches);
    }).toThrowErrorMatchingInlineSnapshot(
      `[Error: Cannot apply patch at 'students/1'.]`,
    );

    const applied = produce.applyPatches({ students: {} }, patches);

    expect(applied).toMatchInlineSnapshot(`
      {
        "students": {
          "1": {
            "id": "1",
            "name": "Alice",
          },
        },
      }
    `);

    const { patches: patches2 } = produce.patch(
      {} as { baz: string; foo: string },
      draft => {
        draft.foo = 'baz';
        draft.baz = 'biz';
      },
    );

    expect(patches2).toMatchInlineSnapshot(`
      [
        {
          "op": "add",
          "path": [
            "foo",
          ],
          "value": "baz",
        },
        {
          "op": "add",
          "path": [
            "baz",
          ],
          "value": "biz",
        },
      ]
    `);
    /**
     * Filter out all patches where pathClock is > command.stagedAt...
     */
    expect(produce.applyPatches({ foo: 'bar' }, patches2))
      .toMatchInlineSnapshot(`
      {
        "baz": "biz",
        "foo": "baz",
      }
    `);
  });
});
