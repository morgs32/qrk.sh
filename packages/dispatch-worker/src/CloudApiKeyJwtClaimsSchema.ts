import type { ISystemId } from '@zerospin/core/system/types';
import { coreAbbreviations } from '@zerospin/core/utils/coreAbbreviations';
import { makeAbbreviationIdSchema } from '@zerospin/schema';
import { Schema } from 'effect';

/** Raw Clerk user dev API key `claims` object (JWT template). */
export interface IUserDevKeyJwtClaims {
  readonly systemId: ISystemId;
  readonly systemEnvironmentId: 'dev';
  readonly keyType: 'secret' | 'publishable';
  readonly keyPairName: string;
  readonly clerkUserId: string;
}

/** Raw Clerk system production API key `claims` object (JWT template). */
export interface ISystemProductionKeyJwtClaims {
  readonly systemId: ISystemId;
  readonly systemEnvironmentId: 'production';
  readonly keyType: 'secret' | 'publishable';
  readonly keyPairName: string;
}

export type ICloudApiKeyJwtClaims =
  | IUserDevKeyJwtClaims
  | ISystemProductionKeyJwtClaims;

const cloudApiKeyJwtClaimsBase = {
  systemId: makeAbbreviationIdSchema(coreAbbreviations.system),
  keyType: Schema.Literals(['secret', 'publishable']),
  keyPairName: Schema.String,
} as const;

export const UserDevKeyJwtClaimsSchema = Schema.Struct({
  ...cloudApiKeyJwtClaimsBase,
  systemEnvironmentId: Schema.Literal('dev'),
  clerkUserId: Schema.String,
}) satisfies Schema.Codec<IUserDevKeyJwtClaims>;

export const SystemProductionKeyJwtClaimsSchema = Schema.Struct({
  ...cloudApiKeyJwtClaimsBase,
  systemEnvironmentId: Schema.Literal('production'),
}) satisfies Schema.Codec<ISystemProductionKeyJwtClaims>;

export const CloudApiKeyJwtClaimsSchema = Schema.Union([
  UserDevKeyJwtClaimsSchema,
  SystemProductionKeyJwtClaimsSchema,
]);
