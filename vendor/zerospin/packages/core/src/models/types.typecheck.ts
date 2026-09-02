import type {
  IDateDescriptor,
  InferEncodedRow,
  IPrimaryKeyDescriptor,
  IPrimitiveDescriptor,
  IShape,
  ITextDescriptor,
} from '@zerospin/schema';
import { assert, type Equals } from 'tsafe';

import type {
  IEncodedProperties,
  IEncodedResourceShape,
  IProperties,
  IResourceShape,
} from './types.ts';

assert<Equals<IProperties, IResourceShape & IShape>>();
/** Full row descriptor map: fixed framework columns plus arbitrary attribute keys. */
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
    } &
      Readonly<{ deletedAt?: Date | null | undefined }> &
      Record<string, unknown>
  >
>();
assert<
  Equals<
    Pick<IEncodedProperties, keyof IResourceShape>,
    InferEncodedRow<IResourceShape>
  >
>();
