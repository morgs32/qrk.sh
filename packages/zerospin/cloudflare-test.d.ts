/**
 * qrk.sh Workerd E2E ambient types:
 * - `Cloudflare.GlobalProps.mainModule` makes `cloudflare:workers` `exports`
 *   mirror `src/Worker.ts`.
 * - `cloudflare:workers` `env` uses Wrangler's generated `Env`.
 */

declare namespace Cloudflare {
  interface GlobalProps {
    mainModule: typeof import("./src/Worker");
  }
}

declare module "cloudflare:test" {
  export function runInDurableObject<INSTANCE, RESULT>(
    stub: DurableObjectStub<INSTANCE>,
    callback: (instance: INSTANCE, state: DurableObjectState) => RESULT | Promise<RESULT>,
  ): Promise<Awaited<RESULT>>;
}

declare module "cloudflare:workers" {
  export const exports: Cloudflare.GlobalProps["mainModule"];

  export const env: Cloudflare.Env & Record<string, unknown>;
}
