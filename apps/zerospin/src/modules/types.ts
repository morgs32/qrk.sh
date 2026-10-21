export type IJsonValue =
  | null
  | boolean
  | number
  | string
  | ReadonlyArray<null | boolean | number | string | object>
  | Readonly<{ [key: string]: null | boolean | number | string | object }>;

