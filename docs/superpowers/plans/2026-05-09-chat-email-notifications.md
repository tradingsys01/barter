# Chat Email Notifications — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Email a chat recipient when they receive a message they haven't seen yet, exactly once per chat per unread cycle, with a working unsubscribe link.

**Architecture:** Server action `sendMessage` schedules `maybeSendChatEmail` via Next.js `after()`. The gate uses two new boolean columns on `chats` (`email_pending_initiator` / `email_pending_owner`) to enforce "first unread only". The existing `markChatRead` (already invoked on chat-page load) is extended to clear the flag. Email is sent via Resend HTTP API in prod, Inbucket SMTP in dev. A signed-token unsubscribe page flips a new `notify_chat_email` flag on `public.users`.

**Tech Stack:** Next.js 16.2 (App Router, `after()` from `next/server`), Postgres (self-hosted Supabase), `@supabase/supabase-js` service-role client, Resend HTTP API, Vitest for unit tests, Inbucket for local SMTP capture.

**Spec:** `docs/superpowers/specs/2026-05-09-chat-email-notifications-design.md`

---

## Conventions for the engineer

- The codebase is `pnpm`-based. All commands assume `cwd = /home/gs/ws/barter`.
- Migrations live in `supabase/migrations/` numbered sequentially. Last one is `0015_drop_accepts_credits.sql`. The new migration in Task 1 is `0016_chat_email_notifications.sql`.
- Apply migrations with `pnpm db:apply` (it pipes every `.sql` in order into the dev `supabase-db` container, then runs `seed.sql`). Idempotent for new tables/columns; for ALTERs, only apply the new migration manually if you've already run the old ones — see Task 1 step 2.
- Run unit tests with `pnpm test:unit`. Tests live under `tests/unit/`.
- Test framework is Vitest with `environment: "node"` and `@/` alias to repo root (see `vitest.config.ts`).
- Two Supabase client factories already exist: user-context `createClient()` from `@/lib/supabase/server` (uses cookies → respects RLS), and service-role `createServiceClient(URL, SUPABASE_SERVICE_ROLE_KEY)` from `@supabase/supabase-js` (used in `lib/admin/queries.ts`). The new `lib/chat/notify.ts` MUST use the service-role variant — it reads the recipient's email and preference flag, which their own RLS hides from other users.
- Commit message style follows existing log: `feat(scope): summary`, `fix(scope): summary`, `docs(scope): summary`. The repo uses `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` trailers.
- DO NOT skip git hooks (`--no-verify`).

---

## File structure

**New files**

| Path | Purpose |
|---|---|
| `supabase/migrations/0016_chat_email_notifications.sql` | Add `email_pending_*` flags on `chats`, `notify_chat_email` on `users`. |
| `lib/email/resend.ts` | Provider-agnostic `sendEmail({to, subject, text, html, headers})` with Resend + Inbucket backends. |
| `lib/email/unsubscribe-token.ts` | HMAC sign/verify for `?token=` strings. |
| `lib/chat/notify.ts` | `maybeSendChatEmail(chatId, senderId, body)` — gate, compose, send. |
| `app/unsubscribe/page.tsx` | Token-verified opt-out page (server component). |
| `app/unsubscribe/actions.ts` | Server action that flips `notify_chat_email`. |
| `tests/unit/email/unsubscribe-token.test.ts` | Sign/verify roundtrip + tamper rejection. |
| `tests/unit/chat/notify.test.ts` | Gate logic with mocked supabase + email client. |
| `tests/unit/email/resend.test.ts` | Provider switch + payload shape. |

**Modified files**

| Path | Change |
|---|---|
| `lib/chat/actions.ts` | `sendMessage` calls `after(() => maybeSendChatEmail(chat_id, user.id, body))`. |
| `lib/chat/queries.ts` | `markChatRead` also clears the viewer's `email_pending_<side>` in the same UPDATE. |
| `.env.example` (if present) or `deploy/README.md` | Document new env vars. |

**No changes to:** `app/chats/[id]/page.tsx` (already calls `markChatRead`), `components/chat/*`.

---

## Task 1: Migration — schema additions

**Files:**
- Create: `supabase/migrations/0016_chat_email_notifications.sql`

- [ ] **Step 1: Verify the last migration number**

Run: `ls supabase/migrations | tail -3`
Expected: `0015_drop_accepts_credits.sql` is the highest. The new file is `0016_*`. If the highest is different, renumber accordingly.

- [ ] **Step 2: Write the migration file**

Create `supabase/migrations/0016_chat_email_notifications.sql`:

```sql
-- supabase/migrations/0016_chat_email_notifications.sql
-- Per-side "we already emailed about unread messages" flags on chats,
-- and a per-user opt-out for chat email notifications.
--
-- Gate semantics: when email_pending_<side> is true, sendMessage's
-- maybeSendChatEmail will SKIP sending. markChatRead clears the flag
-- when the recipient opens the chat, re-arming the gate for the next
-- new message.

alter table public.chats
  add column if not exists email_pending_initiator boolean not null default false,
  add column if not exists email_pending_owner     boolean not null default false;

-- Per-user preference. Default true (opt-out, not opt-in). Lives on the
-- private users table — NOT exposed via public_users view (which has an
-- explicit column whitelist). Only the user themselves (RLS) and our
-- service-role notify code can read it.
alter table public.users
  add column if not exists notify_chat_email boolean not null default true;

notify pgrst, 'reload schema';
```

- [ ] **Step 3: Apply the migration to the dev database**

Run: `docker exec -i supabase-db psql -U postgres -d postgres < supabase/migrations/0016_chat_email_notifications.sql`
Expected: three `ALTER TABLE` / `NOTIFY` lines, no errors. Re-running is safe due to `if not exists`.

- [ ] **Step 4: Verify columns exist**

Run:
```bash
docker exec -i supabase-db psql -U postgres -d postgres -c "\d public.chats" | grep email_pending
docker exec -i supabase-db psql -U postgres -d postgres -c "\d public.users"  | grep notify_chat_email
```
Expected:
```
 email_pending_initiator | boolean | ... | not null | false
 email_pending_owner     | boolean | ... | not null | false
 notify_chat_email       | boolean | ... | not null | true
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0016_chat_email_notifications.sql
git commit -m "feat(db): chat email notifications schema

Per-side email_pending_* flags on chats for first-unread gate, and
notify_chat_email opt-out on users (kept off the public_users view)."
```

---

## Task 2: Unsubscribe token — sign/verify

Pure-function module. No DB, no network. Test-first.

**Files:**
- Create: `tests/unit/email/unsubscribe-token.test.ts`
- Create: `lib/email/unsubscribe-token.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/email/unsubscribe-token.test.ts`:

```ts
import { describe, expect, it, beforeEach } from "vitest";
import { signUnsubscribeToken, verifyUnsubscribeToken } from "@/lib/email/unsubscribe-token";

beforeEach(() => {
  process.env.NOTIFY_TOKEN_SECRET = "test-secret-do-not-use-in-prod";
});

describe("unsubscribe token", () => {
  it("round-trips a user id for the chat_email purpose", () => {
    const token = signUnsubscribeToken("user-abc", "chat_email");
    expect(verifyUnsubscribeToken(token, "chat_email")).toBe("user-abc");
  });

  it("rejects a tampered token", () => {
    const token = signUnsubscribeToken("user-abc", "chat_email");
    const tampered = token.slice(0, -2) + (token.endsWith("A") ? "B" : "A");
    expect(verifyUnsubscribeToken(tampered, "chat_email")).toBeNull();
  });

  it("rejects a token signed for a different purpose", () => {
    const token = signUnsubscribeToken("user-abc", "marketing");
    expect(verifyUnsubscribeToken(token, "chat_email")).toBeNull();
  });

  it("rejects a malformed token", () => {
    expect(verifyUnsubscribeToken("not-a-token", "chat_email")).toBeNull();
    expect(verifyUnsubscribeToken("", "chat_email")).toBeNull();
  });

  it("throws if NOTIFY_TOKEN_SECRET is unset when signing", () => {
    delete process.env.NOTIFY_TOKEN_SECRET;
    expect(() => signUnsubscribeToken("user-abc", "chat_email")).toThrow(/NOTIFY_TOKEN_SECRET/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit tests/unit/email/unsubscribe-token.test.ts`
Expected: FAIL — module not found / functions not exported.

- [ ] **Step 3: Implement the module**

Create `lib/email/unsubscribe-token.ts`:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

type Purpose = "chat_email";

function secret(): Buffer {
  const s = process.env.NOTIFY_TOKEN_SECRET;
  if (!s) throw new Error("NOTIFY_TOKEN_SECRET is not set");
  return Buffer.from(s, "utf8");
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Buffer | null {
  try {
    const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
    return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
  } catch {
    return null;
  }
}

export function signUnsubscribeToken(userId: string, purpose: Purpose): string {
  const payload = `${userId}:${purpose}`;
  const sig = createHmac("sha256", secret()).update(payload).digest();
  return `${b64url(Buffer.from(payload, "utf8"))}.${b64url(sig)}`;
}

export function verifyUnsubscribeToken(token: string, purpose: Purpose): string | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const payloadBuf = fromB64url(parts[0]);
  const sigBuf = fromB64url(parts[1]);
  if (!payloadBuf || !sigBuf) return null;
  const expected = createHmac("sha256", secret()).update(payloadBuf).digest();
  if (expected.length !== sigBuf.length) return null;
  if (!timingSafeEqual(expected, sigBuf)) return null;
  const [userId, p] = payloadBuf.toString("utf8").split(":");
  if (!userId || p !== purpose) return null;
  return userId;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:unit tests/unit/email/unsubscribe-token.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/email/unsubscribe-token.ts tests/unit/email/unsubscribe-token.test.ts
git commit -m "feat(email): HMAC unsubscribe-token sign/verify"
```

---

## Task 3: Email provider — Resend + Inbucket switch

Provider-agnostic interface so the gate logic doesn't care which backend ships email. Real network calls in tests are out of scope here; we test the payload shape and the provider switch.

**Files:**
- Create: `tests/unit/email/resend.test.ts`
- Create: `lib/email/resend.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/email/resend.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.resetModules();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  process.env.EMAIL_FROM = "Barter <notify@example.com>";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.EMAIL_PROVIDER;
  delete process.env.RESEND_API_KEY;
});

describe("sendEmail", () => {
  it("no-ops with a warn log when EMAIL_PROVIDER is unset", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { sendEmail } = await import("@/lib/email/resend");
    await sendEmail({ to: "u@example.com", subject: "x", text: "y" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("EMAIL_PROVIDER"));
    warn.mockRestore();
  });

  it("posts to Resend with a Bearer token when provider=resend", async () => {
    process.env.EMAIL_PROVIDER = "resend";
    process.env.RESEND_API_KEY = "re_test_key";
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    const { sendEmail } = await import("@/lib/email/resend");
    await sendEmail({
      to: "u@example.com",
      subject: "Hello",
      text: "body",
      headers: { "List-Unsubscribe": "<https://x/u>" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer re_test_key",
      "Content-Type": "application/json",
    });
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({
      from: "Barter <notify@example.com>",
      to: "u@example.com",
      subject: "Hello",
      text: "body",
      headers: { "List-Unsubscribe": "<https://x/u>" },
    });
  });

  it("throws on Resend non-2xx so callers can reset the gate flag", async () => {
    process.env.EMAIL_PROVIDER = "resend";
    process.env.RESEND_API_KEY = "re_test_key";
    fetchMock.mockResolvedValue(new Response("rate limit", { status: 429 }));
    const { sendEmail } = await import("@/lib/email/resend");
    await expect(
      sendEmail({ to: "u@example.com", subject: "x", text: "y" }),
    ).rejects.toThrow(/429/);
  });

  it("throws if RESEND_API_KEY missing under provider=resend", async () => {
    process.env.EMAIL_PROVIDER = "resend";
    const { sendEmail } = await import("@/lib/email/resend");
    await expect(
      sendEmail({ to: "u@example.com", subject: "x", text: "y" }),
    ).rejects.toThrow(/RESEND_API_KEY/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit tests/unit/email/resend.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

Create `lib/email/resend.ts`:

```ts
type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  headers?: Record<string, string>;
};

export async function sendEmail(input: SendEmailInput): Promise<void> {
  const provider = process.env.EMAIL_PROVIDER;
  if (!provider) {
    console.warn(
      "[email] EMAIL_PROVIDER is unset — skipping email send. " +
        "Set EMAIL_PROVIDER=resend in prod or =inbucket in dev.",
    );
    return;
  }
  const from = process.env.EMAIL_FROM;
  if (!from) throw new Error("EMAIL_FROM is not set");

  if (provider === "resend") {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY is not set");
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: input.subject,
        text: input.text,
        ...(input.html ? { html: input.html } : {}),
        ...(input.headers ? { headers: input.headers } : {}),
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Resend ${res.status}: ${detail.slice(0, 200)}`);
    }
    return;
  }

  if (provider === "inbucket") {
    // Inbucket exposes SMTP on supabase-mail:2500 in the dev compose stack.
    // Use a tiny SMTP client. We avoid taking a dep on `nodemailer` for this;
    // a hand-rolled client is fine because inbucket accepts plain SMTP with
    // no auth and we only ever send small text/html bodies.
    const { sendViaInbucket } = await import("./inbucket");
    await sendViaInbucket({ from, ...input });
    return;
  }

  throw new Error(`Unknown EMAIL_PROVIDER: ${provider}`);
}
```

- [ ] **Step 4: Implement the inbucket helper**

Create `lib/email/inbucket.ts`:

```ts
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

export async function sendViaInbucket(input: InbucketInput): Promise<void> {
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
    input.text + `\r\n` +
    `.\r\n`;
  sock.write(body);
  await new Promise((r) => setTimeout(r, 50));
  await cmd(`QUIT`);
  sock.end();
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test:unit tests/unit/email/resend.test.ts`
Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add lib/email/resend.ts lib/email/inbucket.ts tests/unit/email/resend.test.ts
git commit -m "feat(email): provider-agnostic sendEmail (Resend + Inbucket)"
```

---

## Task 4: Gate logic — `maybeSendChatEmail`

The core. Service-role DB reads, atomic flag-set, error-path reset, opt-out check.

**Files:**
- Create: `tests/unit/chat/notify.test.ts`
- Create: `lib/chat/notify.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/chat/notify.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Hoisted mocks — `vi.mock` is hoisted to the top of the file at runtime.
const sendEmailMock = vi.fn();
vi.mock("@/lib/email/resend", () => ({ sendEmail: sendEmailMock }));

const supabaseState: {
  chat: any;
  recipient: any;
  sender: any;
  conditionalUpdateAffected: number;
  resetCalls: number;
} = {
  chat: null,
  recipient: null,
  sender: null,
  conditionalUpdateAffected: 1,
  resetCalls: 0,
};

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from(table: string) {
      const builder: any = {
        _table: table,
        _select: null as string | null,
        _eq: [] as Array<[string, unknown]>,
        _update: null as Record<string, unknown> | null,
        select(cols: string) { builder._select = cols; return builder; },
        update(patch: Record<string, unknown>) { builder._update = patch; return builder; },
        eq(col: string, val: unknown) { builder._eq.push([col, val]); return builder; },
        async maybeSingle() {
          if (table === "chats") return { data: supabaseState.chat, error: null };
          if (table === "users")  {
            const idEq = builder._eq.find((e: any) => e[0] === "id");
            if (idEq && supabaseState.recipient && idEq[1] === supabaseState.recipient.id) {
              return { data: supabaseState.recipient, error: null };
            }
            if (idEq && supabaseState.sender && idEq[1] === supabaseState.sender.id) {
              return { data: supabaseState.sender, error: null };
            }
            return { data: null, error: null };
          }
          if (table === "listings") return { data: { title: "Kayak" }, error: null };
          return { data: null, error: null };
        },
        // For the conditional UPDATE we use .select("id") so it returns rows.
        async then(resolve: (v: unknown) => unknown) {
          if (builder._update && table === "chats") {
            // Reset path (no condition on email_pending_*) returns ok.
            if ((builder._update as any).email_pending_initiator === false ||
                (builder._update as any).email_pending_owner === false) {
              supabaseState.resetCalls++;
              return resolve({ data: [{ id: "c1" }], error: null });
            }
            // Pending-set path: return rows count from state.
            return resolve({
              data: Array.from({ length: supabaseState.conditionalUpdateAffected }, () => ({ id: "c1" })),
              error: null,
            });
          }
          return resolve({ data: null, error: null });
        },
      };
      return builder;
    },
  }),
}));

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  process.env.NOTIFY_TOKEN_SECRET = "test-secret";
  process.env.APP_URL = "https://barter.test";
  process.env.EMAIL_FROM = "Barter <notify@barter.test>";
  process.env.EMAIL_PROVIDER = "resend";
  process.env.RESEND_API_KEY = "re_test";

  sendEmailMock.mockReset();
  sendEmailMock.mockResolvedValue(undefined);
  supabaseState.chat = {
    id: "c1",
    initiator_id: "u-init",
    owner_id: "u-own",
    listing_id: "l1",
    email_pending_initiator: false,
    email_pending_owner: false,
  };
  supabaseState.recipient = {
    id: "u-own",
    email: "owner@example.com",
    notify_chat_email: true,
  };
  supabaseState.sender = { id: "u-init", email: "init@example.com", notify_chat_email: true };
  supabaseState.conditionalUpdateAffected = 1;
  supabaseState.resetCalls = 0;
});

afterEach(() => {
  vi.resetModules();
});

describe("maybeSendChatEmail — gate", () => {
  it("sends to the owner when initiator is the sender", async () => {
    const { maybeSendChatEmail } = await import("@/lib/chat/notify");
    // Patch public_users display_name lookups via the same `users` mock entries.
    supabaseState.recipient = { ...supabaseState.recipient, display_name: "Owner Olive" };
    supabaseState.sender = { ...supabaseState.sender, display_name: "Init Ivy" };
    await maybeSendChatEmail("c1", "u-init", "Hi, when can we meet?");
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const arg = sendEmailMock.mock.calls[0][0];
    expect(arg.to).toBe("owner@example.com");
    expect(arg.subject).toMatch(/Init Ivy/);
    expect(arg.text).toContain("Init Ivy");
    expect(arg.text).toContain("Hi, when can we meet?");
    expect(arg.text).toContain("Kayak");
    expect(arg.text).toContain("https://barter.test/chats/c1");
    expect(arg.headers?.["List-Unsubscribe"]).toMatch(/^<https:\/\/barter\.test\/unsubscribe\?token=/);
    expect(arg.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });

  it("sends to the initiator when owner is the sender", async () => {
    const { maybeSendChatEmail } = await import("@/lib/chat/notify");
    supabaseState.recipient = { id: "u-init", email: "init@example.com", notify_chat_email: true, display_name: "Init Ivy" };
    supabaseState.sender    = { id: "u-own",  email: "owner@example.com", notify_chat_email: true, display_name: "Owner Olive" };
    await maybeSendChatEmail("c1", "u-own", "Sure, Saturday at 10?");
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0][0].to).toBe("init@example.com");
  });

  it("skips when recipient has notify_chat_email=false", async () => {
    supabaseState.recipient.notify_chat_email = false;
    const { maybeSendChatEmail } = await import("@/lib/chat/notify");
    await maybeSendChatEmail("c1", "u-init", "x");
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("skips when email_pending_<side> is already true", async () => {
    supabaseState.chat.email_pending_owner = true;
    const { maybeSendChatEmail } = await import("@/lib/chat/notify");
    await maybeSendChatEmail("c1", "u-init", "x");
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("skips when the conditional UPDATE returns 0 rows (race lost)", async () => {
    supabaseState.conditionalUpdateAffected = 0;
    const { maybeSendChatEmail } = await import("@/lib/chat/notify");
    await maybeSendChatEmail("c1", "u-init", "x");
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("resets email_pending_<side> when sendEmail throws", async () => {
    sendEmailMock.mockRejectedValue(new Error("Resend 429: rate limit"));
    const errLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const { maybeSendChatEmail } = await import("@/lib/chat/notify");
    await maybeSendChatEmail("c1", "u-init", "x");
    expect(supabaseState.resetCalls).toBe(1);
    errLog.mockRestore();
  });

  it("truncates body over 500 chars with ellipsis", async () => {
    const long = "a".repeat(600);
    const { maybeSendChatEmail } = await import("@/lib/chat/notify");
    supabaseState.recipient = { ...supabaseState.recipient, display_name: "Owner Olive" };
    supabaseState.sender    = { ...supabaseState.sender,    display_name: "Init Ivy" };
    await maybeSendChatEmail("c1", "u-init", long);
    const text = sendEmailMock.mock.calls[0][0].text as string;
    expect(text).toContain("a".repeat(500) + "…");
    expect(text).not.toContain("a".repeat(501));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit tests/unit/chat/notify.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

Create `lib/chat/notify.ts`:

```ts
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email/resend";
import { signUnsubscribeToken } from "@/lib/email/unsubscribe-token";

const MAX_BODY_CHARS = 500;

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n) + "…";
}

export async function maybeSendChatEmail(
  chatId: string,
  senderId: string,
  body: string,
): Promise<void> {
  const db = admin();

  // 1. Load the chat with both pending flags + listing id.
  const { data: chat } = await db
    .from("chats")
    .select("id, initiator_id, owner_id, listing_id, email_pending_initiator, email_pending_owner")
    .eq("id", chatId)
    .maybeSingle();
  if (!chat) return;

  // 2. Resolve recipient + side.
  const recipientId =
    senderId === chat.initiator_id ? chat.owner_id : chat.initiator_id;
  const side: "initiator" | "owner" =
    recipientId === chat.initiator_id ? "initiator" : "owner";
  const flagCol =
    side === "initiator" ? "email_pending_initiator" : "email_pending_owner";

  // 3. Pending-flag short-circuit (cheap pre-check; the conditional UPDATE
  //    below is the actual concurrency guard).
  if ((chat as any)[flagCol] === true) return;

  // 4. Load recipient settings (private columns — service role required).
  const { data: rec } = await db
    .from("users")
    .select("id, email, display_name, notify_chat_email")
    .eq("id", recipientId)
    .maybeSingle();
  if (!rec || !rec.email) return;
  if (rec.notify_chat_email === false) return;

  // 5. Load sender display_name + listing title for the email body.
  const [{ data: sender }, { data: listing }] = await Promise.all([
    db.from("users").select("id, display_name").eq("id", senderId).maybeSingle(),
    db.from("listings").select("title").eq("id", chat.listing_id).maybeSingle(),
  ]);

  // 6. Atomic flag-set: only if still false. .select("id") returns affected rows.
  const { data: claimed } = await db
    .from("chats")
    .update({ [flagCol]: true })
    .eq("id", chatId)
    .eq(flagCol, false)
    .select("id");
  if (!claimed || claimed.length === 0) return;

  // 7. Compose + send.
  const senderName = sender?.display_name ?? "Someone";
  const recipientName = rec.display_name ?? "there";
  const listingTitle = listing?.title ?? "your listing";
  const token = signUnsubscribeToken(recipientId, "chat_email");
  const appUrl = process.env.APP_URL ?? "";
  const unsubUrl = `${appUrl}/unsubscribe?token=${encodeURIComponent(token)}`;
  const chatUrl = `${appUrl}/chats/${chatId}`;
  const truncated = truncate(body, MAX_BODY_CHARS);

  const subject = `New message from ${senderName} on Barter`;
  const text =
    `Hi ${recipientName},\n\n` +
    `${senderName} sent you a message about your listing\n` +
    `"${listingTitle}":\n\n` +
    `  ${truncated}\n\n` +
    `Reply on Barter:\n${chatUrl}\n\n` +
    `—\nYou're getting this because you have a chat on Barter.\n` +
    `Unsubscribe from chat emails: ${unsubUrl}\n`;

  try {
    await sendEmail({
      to: rec.email,
      subject,
      text,
      headers: {
        "List-Unsubscribe": `<${unsubUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
  } catch (err) {
    console.error("[chat-email] send failed; resetting flag", { chatId, recipientId, err: String(err) });
    await db.from("chats").update({ [flagCol]: false }).eq("id", chatId);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:unit tests/unit/chat/notify.test.ts`
Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/chat/notify.ts tests/unit/chat/notify.test.ts
git commit -m "feat(chat): maybeSendChatEmail gate + composition

First-unread-only via conditional UPDATE on email_pending_<side>.
Service-role DB read for recipient email + opt-out flag. On send
failure, resets the flag so the next message retries."
```

---

## Task 5: Wire `sendMessage` to schedule the email

**Files:**
- Modify: `lib/chat/actions.ts`

- [ ] **Step 1: Read the current `sendMessage`**

Confirm the current shape (should match `lib/chat/actions.ts:64-79`):

```ts
export async function sendMessage(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = sendMessageSchema.parse({
    chat_id: formData.get("chat_id"),
    body: formData.get("body"),
  });

  const supabase = await createClient();
  const { error } = await supabase
    .from("messages")
    .insert({ chat_id: parsed.chat_id, sender_id: user.id, body: parsed.body });
  if (error) throw new Error(error.message);

  revalidatePath(`/chats/${parsed.chat_id}`);
  revalidatePath("/chats");
}
```

- [ ] **Step 2: Add the `after()` call after the insert**

Edit `lib/chat/actions.ts`:

1. Add to imports:
```ts
import { after } from "next/server";
import { maybeSendChatEmail } from "@/lib/chat/notify";
```

2. After the `if (error) throw new Error(error.message);` line and before `revalidatePath`, add:
```ts
  after(async () => {
    try {
      await maybeSendChatEmail(parsed.chat_id, user.id, parsed.body);
    } catch (err) {
      console.error("[sendMessage] notify failed", { chat_id: parsed.chat_id, err: String(err) });
    }
  });
```

The try/catch around `maybeSendChatEmail` is belt-and-suspenders — `maybeSendChatEmail` already swallows its own errors, but `after()` runs after the response and we never want an unhandled rejection in the worker.

Resulting function:

```ts
export async function sendMessage(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = sendMessageSchema.parse({
    chat_id: formData.get("chat_id"),
    body: formData.get("body"),
  });

  const supabase = await createClient();
  const { error } = await supabase
    .from("messages")
    .insert({ chat_id: parsed.chat_id, sender_id: user.id, body: parsed.body });
  if (error) throw new Error(error.message);

  after(async () => {
    try {
      await maybeSendChatEmail(parsed.chat_id, user.id, parsed.body);
    } catch (err) {
      console.error("[sendMessage] notify failed", { chat_id: parsed.chat_id, err: String(err) });
    }
  });

  revalidatePath(`/chats/${parsed.chat_id}`);
  revalidatePath("/chats");
}
```

- [ ] **Step 3: Build to verify types**

Run: `pnpm build`
Expected: build completes. If `after` is missing from `next/server` exports in this version, fall back to `import { unstable_after as after } from "next/server"` (Next 14 name) — but in Next 16.2.4 (`package.json`), the stable `after` is exported.

- [ ] **Step 4: Run unit tests to confirm nothing else broke**

Run: `pnpm test:unit`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add lib/chat/actions.ts
git commit -m "feat(chat): schedule chat-email notification via after()"
```

---

## Task 6: Extend `markChatRead` to clear the flag

**Files:**
- Modify: `lib/chat/queries.ts`
- Create: `tests/unit/chat/mark-read.test.ts`

The existing `markChatRead` builds a `patch` object with one timestamp. We extend it so the same UPDATE also clears `email_pending_<side>`. No new call sites — the existing chat-page invocation continues to work and now also re-arms the gate.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/chat/mark-read.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

const updates: Array<{ table: string; patch: Record<string, unknown>; id: string }> = [];

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from(table: string) {
      const builder: any = {
        _eq: [] as Array<[string, unknown]>,
        _patch: null as Record<string, unknown> | null,
        select() { return builder; },
        update(p: Record<string, unknown>) { builder._patch = p; return builder; },
        eq(c: string, v: unknown) { builder._eq.push([c, v]); return builder; },
        async maybeSingle() {
          // Return a chat whose initiator matches the test user.
          return { data: { initiator_id: "u-init", owner_id: "u-own" }, error: null };
        },
        then(resolve: (v: unknown) => unknown) {
          if (builder._patch) {
            const idEq = builder._eq.find((e: any) => e[0] === "id");
            updates.push({ table, patch: builder._patch, id: String(idEq?.[1]) });
          }
          return resolve({ data: null, error: null });
        },
      };
      return builder;
    },
  }),
}));

describe("markChatRead", () => {
  it("clears email_pending_initiator when the viewer is the initiator", async () => {
    updates.length = 0;
    const { markChatRead } = await import("@/lib/chat/queries");
    await markChatRead("c1", "u-init");
    expect(updates).toHaveLength(1);
    expect(updates[0].patch).toMatchObject({ email_pending_initiator: false });
    expect(updates[0].patch.initiator_last_read_at).toEqual(expect.any(String));
    expect(updates[0].patch).not.toHaveProperty("email_pending_owner");
  });

  it("clears email_pending_owner when the viewer is the owner", async () => {
    updates.length = 0;
    const { markChatRead } = await import("@/lib/chat/queries");
    await markChatRead("c1", "u-own");
    expect(updates).toHaveLength(1);
    expect(updates[0].patch).toMatchObject({ email_pending_owner: false });
    expect(updates[0].patch.owner_last_read_at).toEqual(expect.any(String));
  });

  it("no-ops when the viewer is neither party", async () => {
    updates.length = 0;
    const { markChatRead } = await import("@/lib/chat/queries");
    await markChatRead("c1", "stranger");
    expect(updates).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit tests/unit/chat/mark-read.test.ts`
Expected: FAIL — current `markChatRead` doesn't include `email_pending_*` keys.

- [ ] **Step 3: Update `markChatRead`**

Replace the function body in `lib/chat/queries.ts:144-160`:

```ts
export async function markChatRead(chatId: string, userId: string): Promise<void> {
  const supabase = await createClient();
  const { data: chat } = await supabase
    .from("chats")
    .select("initiator_id, owner_id")
    .eq("id", chatId)
    .maybeSingle();
  if (!chat) return;
  const now = new Date().toISOString();
  const patch =
    chat.initiator_id === userId
      ? { initiator_last_read_at: now, email_pending_initiator: false }
      : chat.owner_id === userId
      ? { owner_last_read_at: now, email_pending_owner: false }
      : null;
  if (!patch) return;
  await supabase.from("chats").update(patch).eq("id", chatId);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:unit tests/unit/chat/mark-read.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Run full unit suite to catch regressions**

Run: `pnpm test:unit`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add lib/chat/queries.ts tests/unit/chat/mark-read.test.ts
git commit -m "feat(chat): markChatRead also clears email_pending_<side>"
```

---

## Task 7: Unsubscribe page + action

**Files:**
- Create: `app/unsubscribe/page.tsx`
- Create: `app/unsubscribe/actions.ts`
- Create: `tests/unit/email/unsubscribe-action.test.ts`

- [ ] **Step 1: Write the failing test for the action**

Create `tests/unit/email/unsubscribe-action.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const updates: Array<{ table: string; patch: Record<string, unknown>; id: string }> = [];

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from(table: string) {
      const builder: any = {
        _eq: [] as Array<[string, unknown]>,
        update(p: Record<string, unknown>) { builder._patch = p; return builder; },
        eq(c: string, v: unknown) { builder._eq.push([c, v]); return builder; },
        then(resolve: (v: unknown) => unknown) {
          const idEq = builder._eq.find((e: any) => e[0] === "id");
          updates.push({ table, patch: builder._patch, id: String(idEq?.[1]) });
          return resolve({ data: null, error: null });
        },
      };
      return builder;
    },
  }),
}));

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  process.env.NOTIFY_TOKEN_SECRET = "test-secret";
  updates.length = 0;
});

describe("setChatEmailPreference", () => {
  it("flips the flag for a valid token", async () => {
    const { signUnsubscribeToken } = await import("@/lib/email/unsubscribe-token");
    const { setChatEmailPreference } = await import("@/app/unsubscribe/actions");
    const token = signUnsubscribeToken("u-123", "chat_email");
    const result = await setChatEmailPreference(token, false);
    expect(result.ok).toBe(true);
    expect(updates).toHaveLength(1);
    expect(updates[0].table).toBe("users");
    expect(updates[0].id).toBe("u-123");
    expect(updates[0].patch).toEqual({ notify_chat_email: false });
  });

  it("rejects a tampered token without writing", async () => {
    const { setChatEmailPreference } = await import("@/app/unsubscribe/actions");
    const result = await setChatEmailPreference("not-a-real-token", false);
    expect(result.ok).toBe(false);
    expect(updates).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit tests/unit/email/unsubscribe-action.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the server action**

Create `app/unsubscribe/actions.ts`:

```ts
"use server";

import { createClient } from "@supabase/supabase-js";
import { verifyUnsubscribeToken } from "@/lib/email/unsubscribe-token";

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function setChatEmailPreference(
  token: string,
  enabled: boolean,
): Promise<{ ok: true } | { ok: false; reason: "invalid_token" }> {
  const userId = verifyUnsubscribeToken(token, "chat_email");
  if (!userId) return { ok: false, reason: "invalid_token" };
  await admin()
    .from("users")
    .update({ notify_chat_email: enabled })
    .eq("id", userId);
  return { ok: true };
}
```

- [ ] **Step 4: Implement the page**

Create `app/unsubscribe/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { verifyUnsubscribeToken } from "@/lib/email/unsubscribe-token";
import { setChatEmailPreference } from "./actions";

type Props = { searchParams: Promise<{ token?: string; done?: string; on?: string }> };

export default async function UnsubscribePage({ searchParams }: Props) {
  const params = await searchParams;
  const token = params.token ?? "";
  const valid = token ? verifyUnsubscribeToken(token, "chat_email") !== null : false;

  if (!valid) {
    return (
      <main className="mx-auto max-w-md p-8">
        <h1 className="text-xl font-semibold">Link invalid or expired</h1>
        <p className="mt-2 text-sm text-zinc-600">
          This unsubscribe link could not be verified. Sign in to{" "}
          <a className="underline" href="/me">your account</a> to manage email preferences.
        </p>
      </main>
    );
  }

  if (params.done === "1") {
    const enabled = params.on === "1";
    return (
      <main className="mx-auto max-w-md p-8 space-y-4">
        <h1 className="text-xl font-semibold">
          {enabled ? "Chat emails re-enabled" : "Unsubscribed from chat emails"}
        </h1>
        <p className="text-sm text-zinc-600">
          {enabled
            ? "You'll get an email when someone messages you about a swap."
            : "You won't get emails for new chat messages anymore."}
        </p>
        <form action={async () => {
          "use server";
          await setChatEmailPreference(token, !enabled);
          const next = !enabled ? "1" : "0";
          redirect(`/unsubscribe?token=${encodeURIComponent(token)}&done=1&on=${next}`);
        }}>
          <button className="text-sm underline" type="submit">
            {enabled ? "Unsubscribe again" : "Re-enable chat emails"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md p-8 space-y-4">
      <h1 className="text-xl font-semibold">Unsubscribe from chat emails?</h1>
      <p className="text-sm text-zinc-600">
        We'll stop emailing you when someone messages you about a swap. You can re-enable
        anytime from this page.
      </p>
      <form action={async () => {
        "use server";
        await setChatEmailPreference(token, false);
        redirect(`/unsubscribe?token=${encodeURIComponent(token)}&done=1&on=0`);
      }}>
        <button
          className="rounded bg-zinc-900 px-4 py-2 text-sm text-white"
          type="submit"
        >
          Unsubscribe
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 5: Run unit tests**

Run: `pnpm test:unit tests/unit/email/unsubscribe-action.test.ts`
Expected: 2 passed.

- [ ] **Step 6: Build to verify types**

Run: `pnpm build`
Expected: build completes.

- [ ] **Step 7: Commit**

```bash
git add app/unsubscribe/page.tsx app/unsubscribe/actions.ts tests/unit/email/unsubscribe-action.test.ts
git commit -m "feat(email): /unsubscribe page + action with HMAC token"
```

---

## Task 8: Document env vars

**Files:**
- Modify: `deploy/README.md`
- Modify: `.env.example` (only if it exists; check first)

- [ ] **Step 1: Check what env example files exist**

Run: `ls -la /home/gs/ws/barter/.env* 2>/dev/null; ls /home/gs/ws/barter/supabase/.env.example`
Note which files are present.

- [ ] **Step 2: Add a chat-email section to `deploy/README.md`**

Open `deploy/README.md` and find the existing Resend SMTP section (around line 160 — `# Resend SMTP relay`). Below it (or wherever the env-var docs for the app live), add:

````markdown
### Chat email notifications (app-level)

The app sends an email when a chat recipient receives a message they
haven't seen yet. Configuration:

```bash
# /opt/barter/.env.production
EMAIL_PROVIDER=resend                       # 'resend' (prod) or 'inbucket' (dev)
EMAIL_FROM='Barter <notify@your-domain>'    # the From: header on outgoing emails
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxx # from resend.com dashboard
NOTIFY_TOKEN_SECRET=<32+ random bytes>      # HMAC secret for unsubscribe links
APP_URL=https://barter.example              # already required; used for absolute links
```

`NOTIFY_TOKEN_SECRET` is independent from the Supabase JWT secret. Generate
with `openssl rand -hex 32`. Rotating it invalidates all outstanding
unsubscribe links — users would need to click a link from a fresher email.

In dev, set `EMAIL_PROVIDER=inbucket` in your local `.env`. Mails appear at
http://localhost:9000 (Inbucket UI from `supabase/dev/docker-compose.dev.yml`).
````

- [ ] **Step 3: If `.env.example` exists at repo root, add the same vars**

Run: `test -f .env.example && cat >> .env.example <<'EOF'

# Chat email notifications
EMAIL_PROVIDER=inbucket
EMAIL_FROM='Barter <notify@localhost>'
# RESEND_API_KEY=
NOTIFY_TOKEN_SECRET=dev-only-do-not-use-in-prod
EOF`

If the file doesn't exist, skip — the deploy README is the source of truth.

- [ ] **Step 4: Commit**

```bash
git add deploy/README.md
test -f .env.example && git add .env.example
git commit -m "docs(deploy): document chat-email env vars"
```

---

## Task 9: Manual verification end-to-end (dev)

This task is verification, not new code. No new commit.

> **Note on the spec's integration test:** The spec calls for an automated
> `tests/integration/chat-email.test.ts` against real Supabase + Inbucket.
> The repo currently has no `tests/integration/` layer (only `tests/unit/`
> and `tests/e2e/`), and the spec also explicitly excludes Playwright for
> this feature. The 10 substeps below cover the same logical scenarios
> (single email per unread cycle, reset-on-read, opt-out, re-enable). If
> the team later wants to automate this, the natural home is a new
> Playwright spec under `tests/e2e/chat-email.spec.ts` that scrapes the
> Inbucket REST API at `http://localhost:9000/api/v1/mailbox/<addr>`.

- [ ] **Step 1: Start dev stack and Inbucket**

Run: `pnpm dev` in one terminal. Confirm Inbucket is running: `curl -fsS http://localhost:9000 > /dev/null && echo OK`.

- [ ] **Step 2: Set dev env vars**

In `.env.local` (or wherever dev secrets live for `pnpm dev`):

```
EMAIL_PROVIDER=inbucket
EMAIL_FROM='Barter <notify@localhost>'
NOTIFY_TOKEN_SECRET=dev-secret-do-not-use-in-prod
APP_URL=http://localhost:3000
INBUCKET_SMTP_HOST=localhost
INBUCKET_SMTP_PORT=2500
```

Restart `pnpm dev` so the new vars are picked up.

- [ ] **Step 3: Trigger a chat between two test accounts**

In a private window, sign in as user A. In another, user B. Have A start a chat on one of B's listings, then send a message.

- [ ] **Step 4: Confirm one email arrived**

Open http://localhost:9000 and select B's mailbox. There should be exactly one email with subject `New message from <A> on Barter`. Body contains the message preview, listing title, a link to `/chats/<id>`, and an `Unsubscribe from chat emails:` line.

- [ ] **Step 5: Send a second message from A. Confirm NO new email**

The Inbucket inbox count for B stays at 1.

- [ ] **Step 6: Open the chat as B (load `/chats/<id>`)**

This invokes `markChatRead` and clears `email_pending_owner`.

- [ ] **Step 7: Send a third message from A. Confirm a fresh email arrived**

Inbucket inbox for B now shows 2 emails.

- [ ] **Step 8: Click the unsubscribe link in the latest email**

Should land on `/unsubscribe?token=...`. Click "Unsubscribe". Confirm:
- Page shows "Unsubscribed from chat emails".
- DB: `select notify_chat_email from public.users where id = '<B>';` returns `f`.
- "Re-enable chat emails" button works in the reverse direction.

- [ ] **Step 9: Send a fourth message from A. Confirm NO email**

Even though `email_pending_owner` would normally be re-armed (B clicked the chat), the `notify_chat_email = false` short-circuit suppresses the send.

- [ ] **Step 10: Re-enable via the page; send a fifth message; confirm email arrives**

Sanity check that re-enabling restores the flow.

If any step fails, fix the implementation, re-run unit tests, redo the failing manual step. Do not move to Task 10 until all 10 substeps pass.

---

## Task 10: Production deploy preparation

This is a checklist, not code.

- [ ] **Step 1: Set the four prod env vars on the VPS**

On the VPS, edit `/opt/barter/.env.production`:

```
EMAIL_PROVIDER=resend
EMAIL_FROM='Barter <notify@<your-domain>>'
RESEND_API_KEY=<from Resend dashboard — likely the same one already used by Supabase Auth, see deploy/README.md:160>
NOTIFY_TOKEN_SECRET=<openssl rand -hex 32>
```

Confirm `APP_URL` is already set and points at the production hostname.

- [ ] **Step 2: Ensure the From-domain is verified in Resend**

The same domain currently used for auth emails works. If sending from a new subdomain (e.g. `notify.barter.example`), verify SPF/DKIM in the Resend dashboard before deploying.

- [ ] **Step 3: Apply the migration on the VPS**

```bash
docker exec -i supabase-db psql -U postgres -d postgres < /opt/barter/supabase/migrations/0016_chat_email_notifications.sql
```

Or whatever the project's standard "apply latest migration on prod" procedure is — see `docs/UPDATING.md` for delta-deploy steps.

- [ ] **Step 4: Build + restart with env sourced**

Per the project's `feedback_prod_build_env.md` memory: prod `pnpm build` must load `/opt/barter/.env.production`. Follow the team's existing build/deploy script.

- [ ] **Step 5: Smoke test in prod**

Send a real chat to a second test account. Confirm:
- Resend dashboard shows the send.
- Email lands in Gmail/Outlook with the one-click unsubscribe button visible.
- Clicking the in-email link to `/chats/<id>` lands on the chat.
- Clicking the in-email unsubscribe button (the one Gmail shows, driven by `List-Unsubscribe`) flips the flag — verify in DB.

If any step fails, investigate before declaring the feature done.

---

## Done criteria

- [ ] All unit tests pass (`pnpm test:unit`).
- [ ] Production build succeeds (`pnpm build`).
- [ ] Manual dev verification (Task 9) passes all 10 substeps.
- [ ] Production smoke (Task 10 step 5) passes.
- [ ] No spec section is unimplemented (recheck against `docs/superpowers/specs/2026-05-09-chat-email-notifications-design.md`).
