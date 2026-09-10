/** App-owned authentication bindings; Zerospin owns the backend Worker. */
declare module "cloudflare:workers" {
  export const env: {
    CLERK_SECRET_KEY: string;
    CLERK_AUTHORIZED_PARTY: string;
  };
}
