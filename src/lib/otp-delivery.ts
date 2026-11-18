import { sendMail } from './smtp';
import { formatPhoneForDisplay } from './phone';

/**
 * How a one-time code reaches the person.
 *
 *   log     — written to the server log. Zero setup, no inbox.
 *   mailpit — posted to a local Mailpit so you can read it in a browser.
 *   sms     — a real provider. Not implemented; add it when you have an account.
 *
 * Production only accepts `sms`. An auth system that quietly logs its own
 * one-time codes, or posts them to a dev mail catcher, is worse than one that
 * is down — so the app refuses to start rather than pretending to deliver.
 */
export type Transport = 'log' | 'mailpit' | 'sms';

const transport = (process.env.OTP_TRANSPORT?.trim() || 'log') as Transport;

if (process.env.NODE_ENV === 'production' && transport !== 'sms') {
  throw new Error(
    `OTP_TRANSPORT is "${transport}" — production requires "sms". ` +
      'Refusing to start with development-only code delivery.',
  );
}

export type SendResult = { ok: true; via: Transport } | { ok: false; error: string };

export async function deliverOtp(phone: string, code: string): Promise<SendResult> {
  switch (transport) {
    case 'log':
      console.info(`[otp:log] code for ${phone} is ${code}`);
      return { ok: true, via: 'log' };

    case 'mailpit': {
      const host = process.env.MAILPIT_HOST?.trim() || '127.0.0.1';
      const port = Number(process.env.MAILPIT_PORT ?? 1026);

      // The address encodes the phone number so a Mailpit inbox with several
      // codes in it is still searchable by who asked for them. Nothing ever
      // sends to this domain for real; it exists to be caught.
      const to = `${phone.replace('+', '')}@touchline.test`;

      try {
        await sendMail({
          host,
          port,
          from: 'codes@touchline.test',
          to,
          subject: `${code} is your Touchline code`,
          text: [
            `Your Touchline sign-in code is ${code}`,
            '',
            `Requested for ${formatPhoneForDisplay(phone)}.`,
            'It expires in 10 minutes and can only be used once.',
            '',
            '— Development delivery. In production this is an SMS.',
          ].join('\n'),
        });
        return { ok: true, via: 'mailpit' };
      } catch (e) {
        return {
          ok: false,
          error: `Mailpit at ${host}:${port} — ${e instanceof Error ? e.message : String(e)}`,
        };
      }
    }

    case 'sms':
      return {
        ok: false,
        error: 'OTP_TRANSPORT=sms but no provider is implemented in otp-delivery.ts',
      };

    default:
      return { ok: false, error: `Unknown OTP_TRANSPORT "${transport}"` };
  }
}
