/**
 * SMS delivery.
 *
 * With SMS_PROVIDER unset, codes are written to the server log instead of
 * being sent. That is the development path. In production the app refuses to
 * start without a provider, because an auth system that silently logs its own
 * one-time codes instead of delivering them is worse than one that is down.
 */

export type SendResult = { ok: true } | { ok: false; error: string };

const provider = process.env.SMS_PROVIDER?.trim() || null;

if (process.env.NODE_ENV === 'production' && !provider) {
  throw new Error(
    'SMS_PROVIDER must be set in production — refusing to start with log-only OTP delivery',
  );
}

export async function sendOtp(phone: string, code: string): Promise<SendResult> {
  if (!provider) {
    // Never reached in production: the guard above throws at import time.
    console.info(`[sms:dev] code for ${phone} is ${code}`);
    return { ok: true };
  }

  switch (provider) {
    // Add the real provider here when you have an account. Deliberately left
    // unimplemented rather than guessed at: the request shape differs per
    // provider and a wrong guess fails at the worst moment.
    default:
      return {
        ok: false,
        error: `SMS_PROVIDER "${provider}" is not implemented in src/lib/sms.ts`,
      };
  }
}
