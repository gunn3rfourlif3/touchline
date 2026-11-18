// Isolates where the database connection fails. Run: node scripts/diagnose-db.mjs
import { existsSync } from 'node:fs';
import net from 'node:net';

if (!process.env.DATABASE_URL) {
  for (const f of ['.env.local', '.env']) {
    if (existsSync(f)) { process.loadEnvFile(f); if (process.env.DATABASE_URL) break; }
  }
}

const url = process.env.DATABASE_URL;
console.log('1. DATABASE_URL:', url ? url.replace(/:[^:@]*@/, ':****@') : 'UNDEFINED');
if (!url) process.exit(1);

const u = new URL(url);
const host = u.hostname, port = Number(u.port || 5432);
console.log('   host:', host, 'port:', port, 'db:', u.pathname.slice(1), 'user:', u.username);

// 2. Raw TCP reachability, with a hard timeout so it cannot hang.
const tcp = await new Promise((resolve) => {
  const s = net.connect({ host, port });
  const done = (r) => { s.destroy(); resolve(r); };
  s.setTimeout(5000);
  s.on('connect', () => done('OPEN'));
  s.on('timeout', () => done('TIMED OUT after 5s'));
  s.on('error', (e) => done('REFUSED: ' + e.code));
});
console.log('2. TCP to', host + ':' + port, '->', tcp);
if (tcp !== 'OPEN') {
  console.log('\n   Nothing is listening there from the host. The container may be');
  console.log('   bound to a different port, or Docker port forwarding is not working.');
  process.exit(1);
}

// 3. Actual Postgres handshake and a query, also time-bounded.
const postgres = (await import('postgres')).default;
const sql = postgres(url, { connect_timeout: 8, idle_timeout: 2, max: 1, onnotice: () => {} });
try {
  const [row] = await sql`select version(), current_database() as db, current_user as usr`;
  console.log('3. Postgres handshake -> OK');
  console.log('   server:', row.version.split(',')[0]);
  console.log('   database:', row.db, '| user:', row.usr);
  const tables = await sql`select count(*)::int as n from information_schema.tables where table_schema='public'`;
  console.log('4. tables in public schema:', tables[0].n);
} catch (e) {
  console.log('3. Postgres handshake -> FAILED');
  console.log('   ', e.code || '', e.message);
} finally {
  await sql.end({ timeout: 2 }).catch(() => {});
}
