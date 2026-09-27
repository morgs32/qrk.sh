# Return the domain object

Return the domain object so its real fields are the result.

```ts
interface RetainedCommand {
  id: string;
  payload: string;
  aggregateIndex: number;
}

export const admit = (retained: RetainedCommand): RetainedCommand => retained;
```

Rejected shapes:

- Return `{ commandId, position, command }` and rename `aggregateIndex` or `serviceIndex` to "position".
- Add `command` beside a receipt that already repeats `command.id` as `commandId`.

A repeated command id is a retry. Admission returns the command already stored. A caller that reuses an id for a different command is responsible. Do not compare command contents, and do not replace that comparison with a hash or a canonical JSON string.
