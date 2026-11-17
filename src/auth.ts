import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';
import { normalisePhone } from '@/lib/phone';
import { verifyChallenge } from '@/lib/otp';

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: 'jwt', maxAge: 60 * 60 * 24 * 90 },
  pages: { signIn: '/sign-in' },
  providers: [
    Credentials({
      id: 'phone-otp',
      name: 'Phone',
      credentials: {
        phone: { label: 'Phone', type: 'tel' },
        code: { label: 'Code', type: 'text' },
        displayName: { label: 'Name', type: 'text' },
      },
      async authorize(raw) {
        const phone = normalisePhone(String(raw?.phone ?? ''));
        const code = String(raw?.code ?? '');
        if (!phone || !/^\d{6}$/.test(code)) return null;

        const verified = await verifyChallenge(phone, code);
        if (!verified.ok) return null;

        const [existing] = await db
          .select()
          .from(users)
          .where(eq(users.phone, phone))
          .limit(1);

        if (existing) {
          // A soft-deleted account signing in again is a returning user, not a
          // new one: clear the deletion rather than creating a duplicate row.
          if (existing.deletedAt) {
            await db
              .update(users)
              .set({ deletedAt: null })
              .where(eq(users.id, existing.id));
          }
          return { id: existing.id, name: existing.displayName };
        }

        const displayName = String(raw?.displayName ?? '').trim().slice(0, 40);
        if (!displayName) return null;

        const [created] = await db
          .insert(users)
          .values({ phone, displayName })
          .returning();

        return { id: created.id, name: created.displayName };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) token.uid = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.uid) session.user.id = String(token.uid);
      return session;
    },
  },
});
