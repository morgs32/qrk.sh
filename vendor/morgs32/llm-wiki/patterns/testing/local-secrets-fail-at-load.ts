import path from 'node:path';

import { config } from 'dotenv';

/**
 * Live integration specs: fail at module load when secrets are missing — not `describe.skipIf`.
 *
 * @bad `describe.skipIf(!process.env.API_KEY)` — suite passes with zero tests when env is unset.
 */
config({ path: path.join(process.cwd(), '.env.local'), override: true });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Missing ${name}. Set it in .env.local.`);
  }
  return value;
}

export const orderApiKey = requireEnv('ORDER_API_KEY');
