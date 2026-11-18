'use server';

import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { normalisePhone } from '@/lib/phone';
import { issueChallenge } from '@/lib/otp';
import { sendOtp } from '@/lib/sms';

export type RequestCodeState = {
  step: 'phone' | 'code';
  phone?: string;
  /** True when this number has no account yet, so the form asks for a name. */
  isNew?: boolean;
  error?: string;
};

export async function requestCode(
  _prev: RequestCodeState,
  formData: FormData,
): Promise<RequestCodeState> {
  const raw = String(formData.get('phone') ?? '');
  const phone = normalisePhone(raw);

  if (!phone) {
    return { step: 'phone', error: "That doesn't look like a mobile number." };
  }

  const issued = await issueChallenge(phone);

  if (!issued.ok) {
    return {
      step: 'phone',
      error: 'Too many codes requested. Try again in an hour.',
    };
  }

  const sent = await sendOtp(phone, issued.code);
  if (!sent.ok) {
    // The challenge row stays; it expires on its own. Do not leak the reason.
    console.error('[sign-in] OTP delivery failed:', sent.error);
    return {
      step: 'phone',
      error: "We couldn't send the code. Try again shortly.",
    };
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.phone, phone))
    .limit(1);

  return { step: 'code', phone, isNew: !existing };
}
