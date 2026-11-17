/**
 * Exercises the OTP flow against a real database. Run with:
 *   DATABASE_URL=... OTP_PEPPER=... npx tsx scripts/verify-otp.ts
 */
import { db } from '../src/db';
import { otpChallenges, users } from '../src/db/schema';
import { issueChallenge, verifyChallenge } from '../src/lib/otp';
import { normalisePhone } from '../src/lib/phone';
import { eq } from 'drizzle-orm';

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) console.log(`        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

async function main() {
  // --- phone normalisation ---
  check('0821234567 normalises', normalisePhone('0821234567'), '+27821234567');
  check('082 123 4567 normalises', normalisePhone('082 123 4567'), '+27821234567');
  check('+27 82 123 4567 normalises', normalisePhone('+27 82 123 4567'), '+27821234567');
  check('27821234567 normalises', normalisePhone('27821234567'), '+27821234567');
  check('all four forms agree', normalisePhone('082-123-4567'), normalisePhone('+27821234567'));
  check('landline rejected', normalisePhone('0211234567'), null);
  check('too short rejected', normalisePhone('08212345'), null);
  check('gibberish rejected', normalisePhone('not a phone'), null);

  const phone = '+27820000001';
  await db.delete(otpChallenges).where(eq(otpChallenges.phone, phone));

  // --- happy path ---
  const issued = await issueChallenge(phone);
  if (!issued.ok) throw new Error('first issue should succeed');
  check('code is 6 digits', /^\d{6}$/.test(issued.code), true);

  const wrong = await verifyChallenge(phone, '000000' === issued.code ? '111111' : '000000');
  check('wrong code rejected', wrong, { ok: false, reason: 'wrong_code' });

  const right = await verifyChallenge(phone, issued.code);
  check('correct code accepted', right, { ok: true });

  // --- replay ---
  const replay = await verifyChallenge(phone, issued.code);
  check('code cannot be reused', replay, { ok: false, reason: 'no_challenge' });

  // --- attempt cap ---
  const phone2 = '+27820000002';
  await db.delete(otpChallenges).where(eq(otpChallenges.phone, phone2));
  const issued2 = await issueChallenge(phone2);
  if (!issued2.ok) throw new Error('issue should succeed');
  for (let i = 0; i < 5; i++) await verifyChallenge(phone2, '999999');
  const capped = await verifyChallenge(phone2, issued2.code);
  check('locks out after 5 wrong attempts, even with the right code', capped, {
    ok: false,
    reason: 'too_many_attempts',
  });

  // --- expiry ---
  const phone3 = '+27820000003';
  await db.delete(otpChallenges).where(eq(otpChallenges.phone, phone3));
  const issued3 = await issueChallenge(phone3);
  if (!issued3.ok) throw new Error('issue should succeed');
  await db
    .update(otpChallenges)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(eq(otpChallenges.phone, phone3));
  const expired = await verifyChallenge(phone3, issued3.code);
  check('expired code rejected', expired, { ok: false, reason: 'expired' });

  // --- send rate limit ---
  const phone4 = '+27820000004';
  await db.delete(otpChallenges).where(eq(otpChallenges.phone, phone4));
  const results = [];
  for (let i = 0; i < 6; i++) results.push(await issueChallenge(phone4));
  check('6th send in an hour is rate limited', results[5], {
    ok: false,
    reason: 'rate_limited',
  });
  check('first 5 sends allowed', results.slice(0, 5).every((r) => r.ok), true);

  // --- plaintext never stored ---
  const [stored] = await db
    .select()
    .from(otpChallenges)
    .where(eq(otpChallenges.phone, phone4))
    .limit(1);
  const anyPlaintext = results.some(
    (r) => r.ok && stored && stored.codeHash.includes(r.code),
  );
  check('plaintext code is not in the stored hash', anyPlaintext, false);

  // cleanup
  for (const p of [phone, phone2, phone3, phone4]) {
    await db.delete(otpChallenges).where(eq(otpChallenges.phone, p));
    await db.delete(users).where(eq(users.phone, p));
  }

  console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURES'}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
