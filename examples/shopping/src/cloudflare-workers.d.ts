import '../../../packages/system-worker/worker-configuration';

declare global {
  namespace Cloudflare {
    interface Env {
      CLERK_JWT_KEY?: string;
      CLERK_AUTHORIZED_PARTIES?: string;
      ZEROSPIN_API_URL?: string;
      ZEROSPIN_SECRET_KEY?: string;
      ASSETS: { fetch(request: Request): Promise<Response> };
      ZEROSPIN_ENVIRONMENT: 'dev' | 'production';
    }
  }
}
