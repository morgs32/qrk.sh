import type { IDb, IResourceDbConfig } from '@zerospin/core/drizzle/types';
import type { IIdentitySchema } from '@zerospin/core/identity/types';
import type {
  IModel,
  IModelReplica,
  InferResource,
} from '@zerospin/core/models/types';
import type {
  IIntegerDescriptor,
  IRefDescriptor,
  IShape,
  ITextDescriptor,
} from '@zerospin/schema';

export type IUser = IRole<{}, 'usr', 'user'>;
export type ICart = IRole<
  {
    userId: IRefDescriptor<
      boolean,
      'usr',
      IUser['table'],
      'id',
      'user',
      'cart',
      true
    >;
  },
  'crt',
  'cart'
>;
export type IProduct = Omit<
  IModelReplica<
    IRole<
      { name: ITextDescriptor<false>; price: IIntegerDescriptor<false> },
      'prd',
      'product'
    >
  >,
  'indexes'
> &
  Pick<IModel, 'indexes'>;
export type ICartItem = IRole<
  {
    cartId: IRefDescriptor<
      boolean,
      'crt',
      ICart['table'],
      'id',
      'cart',
      'items',
      boolean
    >;
    productId: IRefDescriptor<
      boolean,
      'prd',
      IProduct['table'],
      'id',
      'product',
      'cartItems',
      boolean
    >;
  },
  'cit',
  'cartItem'
>;
export type IPurchaseHostModels = {
  user: IUser;
  cart: ICart;
  cartItem: ICartItem;
  product: IProduct;
};
type IRole<
  A extends IShape,
  ABBREVIATION extends string,
  NAME extends string,
> = Omit<IModel<A, ABBREVIATION, NAME>, 'indexes'> & Pick<IModel, 'indexes'>;
export type IUserLookup<
  HOST extends IPurchaseHostModels,
  IDENTITY extends IIdentitySchema,
> = (props: {
  queryDb: Readonly<
    Pick<
      IDb<IResourceDbConfig<{ user: HOST['user'] }, Record<never, never>>>,
      'query'
    >
  >;
  identity: IDENTITY['Type'];
}) => `usr_${string}` | undefined;
export type IPurchaseFrontendOptions<
  HOST extends IPurchaseHostModels,
  IDENTITY extends IIdentitySchema,
> = {
  models: HOST;
  contractVersion?: string;
  identitySchema: IDENTITY;
  resolveUserId: IUserLookup<HOST, IDENTITY>;
  readQuantity: (item: InferResource<HOST['cartItem']>) => number;
};
