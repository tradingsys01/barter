import { createConnection } from "node:net";

type InbucketInput = {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  headers?: Record<string, string>;
};

const HOST = process.env.INBUCKET_SMTP_HOST ?? "localhost";
const PORT = Number(process.env.INBUCKET_SMTP_PORT ?? 2500);

function angle(addr: string): string {
  const m = addr.match(/<([^>]+)>/);
  return m ? m[1] : addr.trim();
}

function assertNoCRLF(value: string, field: string): void {
  if (/\r|\n/.test(value)) {
    throw new Error(`Invalid SMTP value (CRLF in ${field}): ${value.slice(0, 50)}`);
  }
}

function dotStuff(text: string): string {
  return text.replace(/\r?\n\./g, (m) => m.slice(0, -1) + "..");
}

export async function sendViaInbucket(input: InbucketInput): Promise<void> {
  assertNoCRLF(input.from, "from");
  assertNoCRLF(input.to, "to");
  assertNoCRLF(input.subject, "subject");
  for (const [k, v] of Object.entries(input.headers ?? {})) {
    assertNoCRLF(k, `header name "${k}"`);
    assertNoCRLF(v, `header value for "${k}"`);
  }
  const sock = createConnection({ host: HOST, port: PORT });
  const lines: string[] = [];
  let buf = "";
  await new Promise<void>((resolve, reject) => {
    sock.on("data", (d) => {
      buf += d.toString("utf8");
      let i;
      while ((i = buf.indexOf("\r\n")) >= 0) {
        lines.push(buf.slice(0, i));
        buf = buf.slice(i + 2);
      }
    });
    sock.on("error", reject);
    sock.on("connect", resolve);
    sock.setTimeout(5000, () => reject(new Error("inbucket SMTP timeout")));
  });

  async function cmd(line: string): Promise<string> {
    sock.write(line + "\r\n");
    const start = lines.length;
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      if (lines.length > start) return lines[lines.length - 1];
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error(`inbucket no response to: ${line}`);
  }

  try {
    await cmd(`HELO localhost`);
    await cmd(`MAIL FROM:<${angle(input.from)}>`);
    await cmd(`RCPT TO:<${angle(input.to)}>`);
    await cmd(`DATA`);
    const body =
      `From: ${input.from}\r\n` +
      `To: ${input.to}\r\n` +
      `Subject: ${input.subject}\r\n` +
      Object.entries(input.headers ?? {})
        .map(([k, v]) => `${k}: ${v}\r\n`)
        .join("") +
      `Content-Type: text/plain; charset=utf-8\r\n` +
      `\r\n` +
      dotStuff(input.text) + `\r\n` +
      `.\r\n`;
    sock.write(body);
    await new Promise((r) => setTimeout(r, 50));
    await cmd(`QUIT`);
  } finally {
    sock.destroy();
  }
}
