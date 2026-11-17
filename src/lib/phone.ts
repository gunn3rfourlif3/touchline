/**
 * South African phone numbers, normalised to E.164.
 *
 * People type 082 123 4567, 082-123-4567, +27 82 123 4567 and 27821234567.
 * All four are the same person, and storing them as typed means one human with
 * four accounts and a league table that never adds up.
 */

const SA_COUNTRY_CODE = '27';

export function normalisePhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, '');

  let national: string;

  if (digits.startsWith('+' + SA_COUNTRY_CODE)) {
    national = digits.slice(1 + SA_COUNTRY_CODE.length);
  } else if (digits.startsWith(SA_COUNTRY_CODE) && digits.length === 11) {
    national = digits.slice(SA_COUNTRY_CODE.length);
  } else if (digits.startsWith('0')) {
    national = digits.slice(1);
  } else if (digits.startsWith('+')) {
    // A non-SA number. Accept it as given rather than mangling it; the pilot
    // is SA-only but a Saffer abroad still has a local mobile.
    return /^\+\d{8,15}$/.test(digits) ? digits : null;
  } else {
    national = digits;
  }

  // SA mobile national numbers are 9 digits and start 6, 7 or 8.
  if (!/^[678]\d{8}$/.test(national)) {
    return null;
  }

  return `+${SA_COUNTRY_CODE}${national}`;
}

export function formatPhoneForDisplay(e164: string): string {
  if (!e164.startsWith('+27')) return e164;
  const n = e164.slice(3);
  return `0${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5)}`;
}
