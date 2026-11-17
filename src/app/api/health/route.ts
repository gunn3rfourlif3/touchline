import { sql } from 'drizzle-orm';
import { db } from '@/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Caddy and Docker both read this. It checks the database, not just that the
 * process is alive: a container that is running but cannot reach Postgres
 * serves errors, and should be taken out of rotation rather than left in it.
 *
 * Deliberately says nothing about versions, hostnames or connection strings.
 * It is reachable from the proxy network, so it is not a place for detail.
 */
export async function GET() {
  const startedAt = Date.now();

  try {
    await db.execute(sql`select 1`);
    return Response.json(
      { status: 'ok', db: 'up', ms: Date.now() - startedAt },
      { status: 200, headers: { 'cache-control': 'no-store' } },
    );
  } catch {
    return Response.json(
      { status: 'degraded', db: 'down' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }
}
