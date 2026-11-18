/**
 * Stands up a throwaway SMTP server, sends through the real client, and
 * asserts the message arrived intact. Proves the hand-rolled SMTP speaks the
 * protocol correctly without needing Mailpit present.
 *
 *   npx tsx scripts/verify-smtp.ts
 */
import net from 'node:net';
import { sendMail } from '../src/lib/smtp';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

type Captured = { from: string; to: string; data: string };

/** A deliberately pedantic SMTP server: multi-line EHLO, strict sequencing. */
function startServer(): Promise<{ port: number; captured: Captured[]; close: () => void }> {
  const captured: Captured[] = [];

  const server = net.createServer((socket) => {
    let mode: 'commands' | 'data' = 'commands';
    let current: Captured = { from: '', to: '', data: '' };
    let buf = '';

    socket.setEncoding('utf8');
    socket.write('220 test.local ESMTP ready\r\n');

    socket.on('data', (chunk: string) => {
      buf += chunk;

      for (;;) {
        const nl = buf.indexOf('\r\n');
        if (nl === -1) break;
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 2);

        if (mode === 'data') {
          if (line === '.') {
            mode = 'commands';
            captured.push(current);
            current = { from: '', to: '', data: '' };
            socket.write('250 2.0.0 Ok: queued\r\n');
          } else {
            // Undo dot-stuffing, as a real server would.
            current.data += (line.startsWith('..') ? line.slice(1) : line) + '\n';
          }
          continue;
        }

        const upper = line.toUpperCase();
        if (upper.startsWith('EHLO')) {
          // Multi-line reply, to prove the client waits for the terminator.
          socket.write('250-test.local greets you\r\n');
          socket.write('250-SIZE 10240000\r\n');
          socket.write('250 8BITMIME\r\n');
        } else if (upper.startsWith('MAIL FROM:')) {
          current.from = line.slice(line.indexOf('<') + 1, line.lastIndexOf('>'));
          socket.write('250 2.1.0 Ok\r\n');
        } else if (upper.startsWith('RCPT TO:')) {
          current.to = line.slice(line.indexOf('<') + 1, line.lastIndexOf('>'));
          socket.write('250 2.1.5 Ok\r\n');
        } else if (upper === 'DATA') {
          mode = 'data';
          socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
        } else if (upper === 'QUIT') {
          socket.write('221 2.0.0 Bye\r\n');
          socket.end();
        } else {
          socket.write('500 5.5.2 Unrecognised\r\n');
        }
      }
    });
    socket.on('error', () => {});
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({ port, captured, close: () => server.close() });
    });
  });
}

async function main() {
  const srv = await startServer();

  // --- a normal message ---
  await sendMail({
    host: '127.0.0.1',
    port: srv.port,
    from: 'codes@touchline.test',
    to: '27821234567@touchline.test',
    subject: '123456 is your Touchline code',
    text: 'Your Touchline sign-in code is 123456\n\nExpires in 10 minutes.',
  });

  check('one message arrived', srv.captured.length === 1, `${srv.captured.length}`);
  const m = srv.captured[0];
  check('envelope sender correct', m?.from === 'codes@touchline.test', m?.from);
  check('envelope recipient correct', m?.to === '27821234567@touchline.test', m?.to);
  check('subject header present', m?.data.includes('Subject: 123456 is your Touchline code'));
  check('body present', m?.data.includes('Your Touchline sign-in code is 123456'));
  check('charset declared', m?.data.includes('Content-Type: text/plain; charset=utf-8'));
  check('headers and body separated by a blank line', /\n\n/.test(m?.data ?? ''));

  // --- dot-stuffing: a line that is only "." must not end the message ---
  await sendMail({
    host: '127.0.0.1',
    port: srv.port,
    from: 'codes@touchline.test',
    to: 'dots@touchline.test',
    subject: 'dot test',
    text: 'before\n.\nafter',
  });
  const d = srv.captured[1];
  check('dot-only line survives', Boolean(d?.data.includes('before\n.\nafter')), 'dot-stuffing');
  check('message after the dot line is intact', srv.captured.length === 2);

  // --- a closed port fails fast rather than hanging ---
  const deadPort = srv.port + 1;
  srv.close();
  let refused = '';
  const t0 = Date.now();
  try {
    await sendMail({
      host: '127.0.0.1',
      port: deadPort,
      from: 'a@b.test',
      to: 'c@d.test',
      subject: 'x',
      text: 'x',
      timeoutMs: 2000,
    });
  } catch (e) {
    refused = e instanceof Error ? e.message : String(e);
  }
  check('unreachable port throws', refused.length > 0, refused.slice(0, 60));
  check('and does so quickly, not after a hang', Date.now() - t0 < 3000, `${Date.now() - t0}ms`);

  console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURES'}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
