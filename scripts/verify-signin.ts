/**
 * Drives the real sign-in round trip over HTTP against a running dev server:
 * issue a challenge, post it to Auth.js, confirm a session comes back and a
 * user row exists. Run with:
 *   BASE=http://127.0.0.1:3006 npx tsx scripts/verify-signin.ts
 */
import { eq } from 'drizzle-orm';
import { db } from '../src/db';
import { users, otpChallenges } from '../src/db/schema';
import { issueChallenge } from '../src/lib/otp';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3006';
const PHONE = '+27820000911';
const NAME = 'Round Trip Test';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

function cookiesFrom(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}

async function signInWith(code: string, name: string) {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const csrfCookies = cookiesFrom(csrfRes);

  const body = new URLSearchParams({
    phone: PHONE,
    code,
    displayName: name,
    csrfToken,
    callbackUrl: BASE,
    json: 'true',
  });

  const res = await fetch(`${BASE}/api/auth/callback/phone-otp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      cookie: csrfCookies,
      origin: BASE,
    },
    body,
    redirect: 'manual',
  });

  const setCookies = res.headers.getSetCookie();
  const sessionCookie = setCookies.find((c) =>
    /authjs\.session-token|next-auth\.session-token/.test(c),
  );
  return { res, sessionCookie, allCookies: [csrfCookies, cookiesFrom(res)].join('; ') };
}

async function main() {
  // clean slate
  await db.delete(otpChallenges).where(eq(otpChallenges.phone, PHONE));
  await db.delete(users).where(eq(users.phone, PHONE));

  // --- wrong code is rejected ---
  const issued = await issueChallenge(PHONE);
  if (!issued.ok) throw new Error('could not issue challenge');

  const bad = issued.code === '000000' ? '111111' : '000000';
  const wrong = await signInWith(bad, NAME);
  check('wrong code yields no session cookie', !wrong.sessionCookie);

  const noUserYet = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.phone, PHONE));
  check('wrong code creates no user row', noUserYet.length === 0);

  // --- correct code signs in and creates the account ---
  const issued2 = await issueChallenge(PHONE);
  if (!issued2.ok) throw new Error('could not issue second challenge');

  const good = await signInWith(issued2.code, NAME);
  check('correct code returns a session cookie', Boolean(good.sessionCookie));

  const [created] = await db
    .select()
    .from(users)
    .where(eq(users.phone, PHONE))
    .limit(1);
  check('user row created', Boolean(created));
  check('display name stored', created?.displayName === NAME, created?.displayName);
  check('phone stored in E.164', created?.phone === PHONE, created?.phone);

  // --- the session actually resolves ---
  const sessionRes = await fetch(`${BASE}/api/auth/session`, {
    headers: { cookie: good.allCookies },
  });
  const session = (await sessionRes.json()) as { user?: { id?: string; name?: string } };
  check('session endpoint returns the user', Boolean(session.user));
  check('session carries the user id', session.user?.id === created?.id, session.user?.id);
  check('session carries the name', session.user?.name === NAME, session.user?.name);

  // --- the code cannot be replayed ---
  const replay = await signInWith(issued2.code, NAME);
  check('used code cannot sign in again', !replay.sessionCookie);

  // --- returning user does not duplicate ---
  const issued3 = await issueChallenge(PHONE);
  if (!issued3.ok) throw new Error('could not issue third challenge');
  await signInWith(issued3.code, 'Someone Else Entirely');

  const rows = await db.select().from(users).where(eq(users.phone, PHONE));
  check('second sign-in reuses the same row', rows.length === 1, `${rows.length} rows`);
  check(
    'returning sign-in does not rename the account',
    rows[0]?.displayName === NAME,
    rows[0]?.displayName,
  );

  // cleanup
  await db.delete(otpChallenges).where(eq(otpChallenges.phone, PHONE));
  await db.delete(users).where(eq(users.phone, PHONE));

  console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURES'}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
