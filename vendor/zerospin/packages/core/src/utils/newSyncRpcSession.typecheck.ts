import { type Brand } from 'effect';

import { type newSyncRpcSession } from './newSyncRpcSession.ts';

type IAdminLikeApi = {
  readonly [Brand.BrandTypeId]: 'TargetApi';
  helloWorld(): Promise<unknown>;
};

type IMockInternalApis = {
  readonly [Brand.BrandTypeId]: 'Apis';
  getAdminApi(props: { adminToken: string }): Promise<IAdminLikeApi>;
};

type ISyncSession = ReturnType<typeof newSyncRpcSession<IMockInternalApis>>;

declare const syncSession: ISyncSession;

const adminApi = syncSession.getAdminApi({ adminToken: 'token' });
void adminApi.helloWorld;

type _AdminApi = typeof adminApi;

type _AssertAdminApiSync = _AdminApi extends Promise<unknown> ? never : true;

void (null as _AssertAdminApiSync);

const _helloWorldPromise: Promise<unknown> = adminApi.helloWorld();
void _helloWorldPromise;

// @ts-expect-error getAdminApi is synchronous in a sync RPC session
const _adminApiPromise: Promise<IAdminLikeApi> = syncSession.getAdminApi({
  adminToken: 'token',
});
