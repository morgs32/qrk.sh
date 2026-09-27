import { assert, type Equals } from 'tsafe';

/**
 * Inline Expected shape inside Equals — no file-local alias used only once.
 *
 * @bad Do not introduce a file-local `IPropertiesStructural` alias used by only this equality assertion.
 */
assert<
  Equals<
    IProperties,
    {
      id: IPrimaryKeyDescriptor;
      modelName: ITextDescriptor;
      createdAt: IDateDescriptor;
      updatedAt: IDateDescriptor;
      version: IIntegerDescriptor;
    } & Record<string, IPrimitiveDescriptor>
  >
>();

declare type IProperties = unknown;
declare type IPrimaryKeyDescriptor = unknown;
declare type ITextDescriptor = unknown;
declare type IDateDescriptor = unknown;
declare type IIntegerDescriptor = unknown;
declare type IPrimitiveDescriptor = unknown;
