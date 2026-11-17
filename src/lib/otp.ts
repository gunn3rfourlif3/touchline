import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { and, eq, gt, isNull, lt, sql } from 'drizzle-orm';
import { db } from '@/db';
import { otpChallenges } from '@/db/schema';

const CODE_LENGTH = 6;
const TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
/** Per phone, per hour. Stops someone burning your SMS credit for fun. */
const MAX_SENDS_PER_HOUR = 5;

function hashCode(phone: string, code: string): string {
  const pepper = process.env.OTP_PEPPER;
  if (!pepper) throw new Error('OTP_PEPPER is not set');
  return createHash('sha256').update(`${phone}:${code}:${pepper}`).digest('hex');
}

export type IssueResult =
  | { ok: true; code: string; expiresAt: Date }
  | { ok: false; reason: 'rate_limited' };

/**
 * Returns the plaintext code for the caller to send by SMS. It is never stored
 * and never logged: only the hash goes to the database, so a database leak
 * does not hand over live codes.
 */
export async function issueChallenge(phone: string): Promise<IssueResult> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(otpChallenges)
    .where(
      and(eq(otpChallenges.phone, phone), gt(otpChallenges.createdAt, oneHourAgo)),
    );

  if (count >= MAX_SENDS_PER_HOUR) {
    return { ok: false, reason: 'rate_limited' };
  }

  const code = String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0');
  const expiresAt = new Date(Date.now() + TTL_MINUTES * 60 * 1000);

  await db.insert(otpChallenges).values({
    phone,
    codeHash: hashCode(phone, code),
    expiresAt,
  });

  return { ok: true, code, expiresAt };
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: 'no_challenge' | 'expired' | 'too_many_attempts' | 'wrong_code' };

export async function verifyChallenge(
  phone: string,
  code: string,
): Promise<VerifyResult> {
  const [challenge] = await db
    .select()
    .from(otpChallenges)
    .where(and(eq(otpChallenges.phone, phone), isNull(otpChallenges.consumedAt)))
    .orderBy(sql`${otpChallenges.createdAt} desc`)
    .limit(1);

  if (!challenge) return { ok: false, reason: 'no_challenge' };
  if (challenge.expiresAt.getTime() < Date.now()) {
    return { ok: false, reason: 'expired' };
  }
  if (challenge.attempts >= MAX_ATTEMPTS) {
    return { ok: false, reason: 'too_many_attempts' };
  }

  const expected = Buffer.from(challenge.codeHash, 'hex');
  const actual = Buffer.from(hashCode(phone, code), 'hex');
  const matches =
    expected.length === actual.length && timingSafeEqual(expected, actual);

  if (!matches) {
    await db
      .update(otpChallenges)
      .set({ attempts: challenge.attempts + 1 })
      .where(eq(otpChallenges.id, challenge.id));
    return { ok: false, reason: 'wrong_code' };
  }

  await db
    .update(otpChallenges)
    .set({ consumedAt: new Date() })
    .where(eq(otpChallenges.id, challenge.id));

  return { ok: true };
}

/** Call from the same cron that ingests fixtures. */
export async function sweepExpiredChallenges(): Promise<number> {
  const result = await db
    .delete(otpChallenges)
    .where(lt(otpChallenges.expiresAt, new Date()));
  return result.count ?? 0;
}
