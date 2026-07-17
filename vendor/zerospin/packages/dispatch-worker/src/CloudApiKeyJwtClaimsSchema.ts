import { makeAbbreviationIdSchema } from '@zerospin/core/models/makeIdSchema';
import type { ISystemId } from '@zerospin/core/system/types';
import { cloudIdAbbreviations } from '@zerospin/core/utils/cloudIdAbbreviations';
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

export type ICloudApiKeyIdentity = ICloudApiKeyJwtClaims & {
  readonly organizationId: string;
};

const cloudApiKeyJwtClaimsBase = {
  systemId: makeAbbreviationIdSchema(cloudIdAbbreviations.systemRecord),
  keyType: Schema.Literal('secret', 'publishable'),
  keyPairName: Schema.String,
} as const;

export const UserDevKeyJwtClaimsSchema = Schema.Struct({
  ...cloudApiKeyJwtClaimsBase,
  systemEnvironmentId: Schema.Literal('dev'),
  clerkUserId: Schema.String,
}) satisfies Schema.Schema<IUserDevKeyJwtClaims>;

export const SystemProductionKeyJwtClaimsSchema = Schema.Struct({
  ...cloudApiKeyJwtClaimsBase,
  systemEnvironmentId: Schema.Literal('production'),
}) satisfies Schema.Schema<ISystemProductionKeyJwtClaims>;

export const CloudApiKeyJwtClaimsSchema = Schema.Union(
  UserDevKeyJwtClaimsSchema,
  SystemProductionKeyJwtClaimsSchema,
);
