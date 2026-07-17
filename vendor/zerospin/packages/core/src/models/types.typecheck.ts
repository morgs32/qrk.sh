import { assert, type Equals } from 'tsafe';

import type {
  IDateDescriptor,
  IEncodedProperties,
  IEncodedResourceShape,
  InferEncodedRow,
  IPrimaryKeyDescriptor,
  IPrimitiveDescriptor,
  IProperties,
  IResourceShape,
  IShape,
  ITextDescriptor,
} from './types.ts';

assert<Equals<IProperties, IResourceShape & IShape>>();
/** Full row descriptor map: fixed metadata columns plus arbitrary attribute keys. */
assert<
  Equals<
    IProperties,
    {
      id: IPrimaryKeyDescriptor<string>;
      modelName: ITextDescriptor<false>;
      createdAt: IDateDescriptor<false>;
      updatedAt: IDateDescriptor<false>;
      version: ITextDescriptor<false>;
    } & Record<string, IPrimitiveDescriptor>
  >
>();

/** Metadata columns on encoded resource rows (model attributes are additional keys). */
assert<
  Equals<
    IEncodedResourceShape,
    {
      id: string;
      modelName: string;
      createdAt: Date;
      updatedAt: Date;
      version: string;
    } & Record<string, unknown>
  >
>();
assert<
  Equals<
    Pick<IEncodedProperties, keyof IResourceShape>,
    InferEncodedRow<IResourceShape>
  >
>();
