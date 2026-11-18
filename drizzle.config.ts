import { existsSync } from 'node:fs';
import type { Config } from 'drizzle-kit';

/**
 * drizzle-kit runs outside Next.js, so nothing has loaded .env.local for it.
 * Next.js loads that file itself; drizzle-kit does not, which means `migrate`
 * would fail with "url: undefined" even though `npm run dev` works fine.
 *
 * process.loadEnvFile is built into Node 20.12+ — no dotenv dependency.
 * Real environment variables win, so production (where DATABASE_URL comes
 * from the container) is unaffected.
 */
if (!process.env.DATABASE_URL) {
  for (const file of ['.env.local', '.env']) {
    if (existsSync(file)) {
      process.loadEnvFile(file);
      if (process.env.DATABASE_URL) break;
    }
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is not set, and no .env.local or .env file provided one.\n' +
      'Copy .env.example to .env.local and fill it in.',
  );
}

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  strict: true,
  verbose: true,
} satisfies Config;
