'use client';

import { useActionState, useState } from 'react';
import { signIn } from 'next-auth/react';
import { requestCode, type RequestCodeState } from './actions';
import { formatPhoneForDisplay } from '@/lib/phone';

const field: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  minHeight: 54,
  padding: '0 16px',
  borderRadius: 14,
  background: '#171E1B',
  border: '1px solid #38443E',
  color: '#F2F5F3',
  fontSize: 16, // 16px or iOS zooms the page on focus
};

const label: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: '#C3CEC8',
  marginBottom: 8,
};

const button: React.CSSProperties = {
  width: '100%',
  minHeight: 54,
  marginTop: 20,
  borderRadius: 16,
  background: '#E8B04B',
  border: 0,
  color: '#10140F',
  fontSize: 16,
  fontWeight: 800,
  cursor: 'pointer',
};

const errorBox: React.CSSProperties = {
  marginTop: 14,
  padding: '12px 14px',
  borderRadius: 12,
  background: 'rgba(214,92,61,0.14)',
  border: '1px solid rgba(214,92,61,0.4)',
  fontSize: 13,
  lineHeight: 1.45,
  color: '#F0A58C',
};

export function SignInForm() {
  const [state, submitPhone, phonePending] = useActionState<
    RequestCodeState,
    FormData
  >(requestCode, { step: 'phone' });

  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  if (state.step === 'phone') {
    return (
      <form action={submitPhone}>
        <label htmlFor="phone" style={label}>
          Mobile number
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          autoFocus
          placeholder="082 123 4567"
          required
          style={field}
        />
        <p style={{ margin: '8px 0 0', fontSize: 12, color: '#8A978F' }}>
          We&apos;ll text you a six-digit code.
        </p>

        {state.error && <div style={errorBox}>{state.error}</div>}

        <button type="submit" disabled={phonePending} style={button}>
          {phonePending ? 'Sending…' : 'Send code'}
        </button>
      </form>
    );
  }

  // Step two: verify. This calls Auth.js directly rather than a server action,
  // because signIn() must run client-side to receive the session cookie.
  async function onVerify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setVerifyError(null);
    setVerifying(true);

    const data = new FormData(e.currentTarget);
    const result = await signIn('phone-otp', {
      phone: state.phone,
      code: String(data.get('code') ?? ''),
      displayName: String(data.get('displayName') ?? ''),
      redirect: false,
    });

    setVerifying(false);

    if (result?.error) {
      // Auth.js collapses every authorize() failure into one error, so the
      // message stays general. That is also the right call for security:
      // "wrong code" and "no such challenge" should not be distinguishable.
      setVerifyError('That code was wrong or has expired. Try again.');
      return;
    }

    window.location.href = '/';
  }

  return (
    <form onSubmit={onVerify}>
      <p style={{ margin: '0 0 24px', fontSize: 14, color: '#C3CEC8', lineHeight: 1.5 }}>
        Code sent to{' '}
        <strong style={{ color: '#F2F5F3' }}>
          {state.phone ? formatPhoneForDisplay(state.phone) : 'your number'}
        </strong>
        .
      </p>

      {state.isNew && (
        <div style={{ marginBottom: 20 }}>
          <label htmlFor="displayName" style={label}>
            Your name
          </label>
          <input
            id="displayName"
            name="displayName"
            type="text"
            autoComplete="given-name"
            maxLength={40}
            placeholder="How your group knows you"
            required
            style={field}
          />
        </div>
      )}

      <label htmlFor="code" style={label}>
        Six-digit code
      </label>
      <input
        id="code"
        name="code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={6}
        autoFocus
        required
        style={{ ...field, letterSpacing: '0.4em', fontWeight: 700 }}
      />

      {verifyError && <div style={errorBox}>{verifyError}</div>}

      <button type="submit" disabled={verifying} style={button}>
        {verifying ? 'Checking…' : 'Sign in'}
      </button>

      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{
          width: '100%',
          minHeight: 48,
          marginTop: 10,
          background: 'transparent',
          border: 0,
          color: '#9BA8A2',
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Use a different number
      </button>
    </form>
  );
}
