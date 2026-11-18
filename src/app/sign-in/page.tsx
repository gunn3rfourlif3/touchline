import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { SignInForm } from './sign-in-form';

export const metadata = {
  title: 'Sign in — Touchline',
};

export default async function SignInPage() {
  const session = await auth();
  if (session?.user) redirect('/');

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#0E1311',
        color: '#F2F5F3',
        display: 'flex',
        flexDirection: 'column',
        padding: '32px 20px 24px',
      }}
    >
      <div style={{ maxWidth: 420, width: '100%', margin: '0 auto', flex: 1 }}>
        <h1
          style={{
            margin: '48px 0 8px',
            fontSize: 28,
            fontWeight: 800,
            letterSpacing: '-0.5px',
            lineHeight: 1.15,
          }}
        >
          Touchline
        </h1>
        <p style={{ margin: '0 0 36px', fontSize: 15, color: '#9BA8A2', lineHeight: 1.5 }}>
          Weekly picks with your group. No stake, no money — bragging rights only.
        </p>

        <SignInForm />
      </div>

      <p
        style={{
          maxWidth: 420,
          width: '100%',
          margin: '24px auto 0',
          fontSize: 11,
          lineHeight: 1.5,
          color: '#8A978F',
          textAlign: 'center',
        }}
      >
        We use your number to sign you in and nothing else. You can delete your
        account and its data at any time.
      </p>
    </main>
  );
}
