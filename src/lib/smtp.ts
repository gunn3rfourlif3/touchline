import net from 'node:net';

/**
 * A minimal SMTP client — enough to hand one message to a local catcher such
 * as Mailpit. No auth, no TLS, no attachments.
 *
 * Deliberately dependency-free. The obvious choice was nodemailer, but the
 * version @auth/core's peer range allows (8.x) carries sixteen advisories,
 * and none of its capability is needed to post one plain-text message to
 * localhost. Every address here is constructed by us, never user input, so
 * the address-parsing classes of bug have nothing to act on.
 *
 * If real transactional email is ever needed, use a provider's HTTP API
 * rather than growing this.
 */

export type SmtpMessage = {
  host: string;
  port: number;
  from: string;
  to: string;
  subject: string;
  text: string;
  timeoutMs?: number;
};

export async function sendMail(msg: SmtpMessage): Promise<void> {
  const timeoutMs = msg.timeoutMs ?? 5000;

  /** What to send, and the reply code that must come back before the next. */
  const steps: Array<{ send: string | null; expect: number }> = [
    { send: null, expect: 220 }, // greeting
    { send: 'EHLO touchline.local', expect: 250 },
    { send: `MAIL FROM:<${msg.from}>`, expect: 250 },
    { send: `RCPT TO:<${msg.to}>`, expect: 250 },
    { send: 'DATA', expect: 354 },
    { send: buildBody(msg), expect: 250 },
    { send: 'QUIT', expect: 221 },
  ];

  await new Promise<void>((resolve, reject) => {
    const socket = net.connect({ host: msg.host, port: msg.port });
    socket.setEncoding('utf8');
    socket.setTimeout(timeoutMs);

    let buffer = '';
    let step = 0;
    let settled = false;

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (err) reject(err);
      else resolve();
    };

    socket.on('timeout', () =>
      finish(new Error(`SMTP timed out after ${timeoutMs}ms at step ${step}`)),
    );
    socket.on('error', (e) => finish(new Error(`SMTP socket error: ${e.message}`)));
    socket.on('close', () =>
      finish(step >= steps.length ? undefined : new Error('SMTP connection closed early')),
    );

    socket.on('data', (chunk: string) => {
      buffer += chunk;

      // A reply may span several lines; only "NNN<space>" terminates it.
      // Anything else (NNN-) is a continuation, so keep waiting.
      const terminator = /^(\d{3}) /m;
      let match = terminator.exec(buffer);
      while (match) {
        const code = Number(match[1]);
        buffer = buffer.slice(match.index + match[0].length).replace(/^[^\n]*\n?/, '');

        const expected = steps[step].expect;
        if (code !== expected) {
          return finish(
            new Error(`SMTP rejected step ${step}: expected ${expected}, got ${code}`),
          );
        }

        step += 1;
        const next = steps[step];
        if (!next) return finish(); // QUIT acknowledged
        if (next.send !== null) socket.write(next.send + '\r\n');

        match = terminator.exec(buffer);
      }
    });
  });
}

function buildBody(msg: SmtpMessage): string {
  const headers = [
    `From: ${msg.from}`,
    `To: ${msg.to}`,
    `Subject: ${msg.subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    `Date: ${new Date().toUTCString()}`,
  ].join('\r\n');

  // Dot-stuffing: a line consisting of "." alone would end the message early.
  const body = msg.text
    .split(/\r?\n/)
    .map((line) => (line.startsWith('.') ? '.' + line : line))
    .join('\r\n');

  return `${headers}\r\n\r\n${body}\r\n.`;
}
