declare namespace Cloudflare {
  interface Env {
    CLERK_JWT_KEY?: string;
    CLERK_AUTHORIZED_PARTIES?: string;
    ZEROSPIN_ENVIRONMENT: 'dev' | 'production';
  }
}

declare module 'cloudflare:workers' {
  export const env: Cloudflare.Env;
}
