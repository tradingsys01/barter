# Chat Email Notifications — Design

**Date:** 2026-05-09
**Status:** Draft (awaiting review)

## Problem

When user A sends a chat message to user B on Barter, B has no out-of-band signal. The chat is poll-based, so unless B happens to have the chat tab open, the message sits unread. Users miss swap opportunities.

## Goal

Email the recipient when they receive a chat message **they haven't seen yet**, so they're nudged back to the app — without spamming users who are actively chatting.

## Non-goals (v1)

- Push notifications (PWA push, mobile native)
- SMS
- Per-chat mute
- Digests / batching
- "Away" detection beyond the read-state gate
- Localization

## Trigger rule: "first unread only"

One email per chat per recipient until they read it; sending resets after they open the chat.

Concretely: if A sends three messages in a row before B opens the chat, B gets **one** email. When B opens the chat, the gate resets; the next message A sends will trigger a fresh email.

### Why this rule

- Quiet enough to stay under Resend's free tier at expected volume (~10 active chats/day on Quadra).
- Doesn't train users to ignore the emails (which would also hurt deliverability of the auth emails sharing the same Resend account).
- No cron / scheduler / "last-seen" tracking needed.
- Simple boolean state per (chat, recipient).

## Architecture

```
sendMessage() server action            (existing — lib/chat/actions.ts:64)
  ├─ insert into messages
  ├─ revalidatePath()
  └─ after(() => maybeSendChatEmail(...))   ← new
                                                  │
                                                  ▼
                                          Resend HTTP API

chat page load (app/chats/[id]/page.tsx)   (existing)
  └─ markChatRead(chatId, userId)          (existing — lib/chat/queries.ts:144)
       └─ already updates last_read_at; extend to also clear
          email_pending_<side> in same UPDATE

unsubscribe link in email
  └─ /unsubscribe?token=<signed>           ← new route
       └─ verifies HMAC, sets notify_chat_email=false
```

### New files

- `lib/email/resend.ts` — thin `fetch` wrapper around Resend HTTP API. Reads `RESEND_API_KEY`, `EMAIL_FROM`. In dev, an `EMAIL_PROVIDER=inbucket` switch routes via SMTP to the existing Inbucket container (`supabase/dev/docker-compose.dev.yml:23`).
- `lib/chat/notify.ts` — `maybeSendChatEmail(chatId, senderId, body)` gate logic + email composition.
- `lib/email/unsubscribe-token.ts` — HMAC sign/verify for unsubscribe tokens.
- `app/unsubscribe/page.tsx` + `app/unsubscribe/actions.ts` — token-verified opt-out page.

### Modified files

- `lib/chat/actions.ts` — `sendMessage` calls `after(() => maybeSendChatEmail(...))` after the insert.
- `lib/chat/queries.ts` — extend the existing `markChatRead(chatId, userId)` (already at line 144, already called from `app/chats/[id]/page.tsx:33`) to also clear `email_pending_<viewerSide>`. No new wiring needed at the page layer.

### New env vars

- `RESEND_API_KEY` — production only.
- `EMAIL_FROM` — e.g. `Barter <notify@barter.example>`.
- `EMAIL_PROVIDER` — `resend` | `inbucket`. No default; must be set explicitly per environment (`inbucket` in dev `.env`, `resend` in prod `.env.production`). Unset = `maybeSendChatEmail` no-ops with a warn log.
- `NOTIFY_TOKEN_SECRET` — HMAC secret for unsubscribe tokens. Independent from Supabase JWT secret.
- `APP_URL` — already present; used for absolute links in emails.

## Data model

One migration, two surface changes. No new tables.

### `chats` — add two boolean flags

```sql
alter table chats
  add column email_pending_initiator boolean not null default false,
  add column email_pending_owner     boolean not null default false;
```

Semantics: `email_pending_<side> = true` means "we already sent an unread-notification email to this side; suppress further emails until they read."

### `public_users` — add opt-out flag

```sql
alter table public_users
  add column notify_chat_email boolean not null default true;
```

Whitelist this column in the existing `public_users` security-definer view used by app reads (see `supabase/migrations/0013_public_users_security_definer.sql`).

### Migration ordering

A single new migration file `supabase/migrations/NNNN_chat_email_notifications.sql` containing both alters and the view update.

## Gate logic — `maybeSendChatEmail(chatId, senderId, body)`

```
1. Load chat: initiator_id, owner_id, listing_id,
              email_pending_initiator, email_pending_owner,
              listings.title.
2. recipientId = (senderId == chat.initiator_id) ? chat.owner_id : chat.initiator_id
3. side = (recipientId == chat.initiator_id) ? 'initiator' : 'owner'
4. If chat.email_pending_<side> == true → return  (already pending)
5. Load recipient public_users: email, display_name, notify_chat_email
6. If notify_chat_email == false → return  (opted out)
7. Load sender public_users: display_name
8. UPDATE chats SET email_pending_<side> = true WHERE id = chatId
   AND email_pending_<side> = false
   (conditional update — if 0 rows affected, another concurrent call already
    won the race; return.)
9. Send email via Resend.
   - On success: done.
   - On error: log {chat_id, sender_id, status, message},
               UPDATE chats SET email_pending_<side> = false WHERE id = chatId
               so the next message retries.
```

The conditional UPDATE at step 8 is the concurrency guard: two messages arriving within the same `after()` window won't both send.

The error-path reset at step 9 means a transient Resend outage doesn't permanently mute a chat — the next message kicks off another attempt.

### Read-reset path — extend existing `markChatRead`

`lib/chat/queries.ts` already exports `markChatRead(chatId, userId)` and it's already invoked from `app/chats/[id]/page.tsx:33` on every chat-page load. Extend its update payload to also clear the viewer's email-pending flag in the same statement:

```ts
const patch =
  c.initiator_id === userId
    ? { initiator_last_read_at: new Date().toISOString(), email_pending_initiator: false }
    : { owner_last_read_at: new Date().toISOString(), email_pending_owner: false };
```

Idempotent. No new file, no new call site.

## Email content

**Subject:** `New message from {sender_display_name} on Barter`

**Plain text body:**
```
Hi {recipient_display_name},

{sender_display_name} sent you a message about your listing
"{listing_title}":

  {message_body_truncated_to_500_chars}

Reply on Barter:
{APP_URL}/chats/{chat_id}

—
You're getting this because you have a chat on Barter.
Unsubscribe from chat emails: {APP_URL}/unsubscribe?token={signed_token}
```

A minimal HTML version mirrors the text (no images, no tracking pixels). Body is truncated to 500 characters with an ellipsis if longer.

**Headers:**
- `From: ${EMAIL_FROM}`
- `List-Unsubscribe: <{APP_URL}/unsubscribe?token=...>`
- `List-Unsubscribe-Post: List-Unsubscribe=One-Click`

The `List-Unsubscribe` headers enable Gmail/Outlook one-click unsubscribe and protect sender reputation. Required by Gmail's bulk-sender rules.

## Unsubscribe flow

### Token

HMAC-SHA256 over `{user_id}:chat_email` using `NOTIFY_TOKEN_SECRET`. Encoded as base64url. No expiry — unsubscribe links must keep working indefinitely.

### `/unsubscribe?token=...` route

1. Verify HMAC. If invalid: render generic "link invalid" page, 400.
2. `update public_users set notify_chat_email = false where id = <user_id>`.
3. Render confirmation page with a "Re-enable chat emails" form (POSTs back to flip the flag to true).

The page works without the user being signed in (the token is the auth) — important because users click these from their email client, not from an active app session.

## Error handling

| Failure | Behavior |
|---|---|
| Resend HTTP non-2xx | Log; reset `email_pending_<side>` to false; `sendMessage` itself succeeded. |
| Missing recipient email | Log; skip. (Shouldn't occur — Supabase Auth requires email.) |
| `markChatRead` DB error | Log; swallow. Worst case: one duplicate email on next message. |
| Bad/tampered unsubscribe token | Generic "link invalid" page, no info leak. |
| `RESEND_API_KEY` missing in prod | `maybeSendChatEmail` no-ops with a `console.error`; `sendMessage` is unaffected. |

No user-visible error in any case — the chat send is the user's primary action and must not fail because of email infra.

## Testing

Per project convention (CLAUDE.md): write tests first, then code, then run.

### Unit — `tests/unit/chat/notify.test.ts` (Vitest)

Mock the Supabase client and the Resend client. Cover:
- Opt-out short-circuits without sending.
- `email_pending_<side> == true` short-circuits.
- Recipient is correctly chosen when sender is initiator.
- Recipient is correctly chosen when sender is owner.
- Concurrent calls: when conditional UPDATE returns 0 rows, no email is sent.
- Resend error path resets the flag.
- Body is truncated at 500 chars; ellipsis appears.

### Unit — `tests/unit/email/unsubscribe-token.test.ts`

- Sign → verify roundtrip succeeds for valid user_id.
- Tampered token rejected.
- Token with wrong purpose string rejected.

### Integration — `tests/integration/chat-email.test.ts`

Real test Supabase + real Inbucket. Sequence:
1. Create two users, create listing, start chat.
2. Send message from A. Assert one email lands in B's Inbucket inbox.
3. Send second message from A. Assert **no** new email.
4. Load `/chats/[id]` as B (markChatRead).
5. Send third message from A. Assert a fresh email lands.
6. POST to `/unsubscribe` with B's token. Send fourth message. Assert no email.

### Out of scope

No Playwright e2e for the email side-effect — unit + integration above cover the contract. E2E is reserved for UI flows.

### Manual verification before merge

- Local: trigger a chat send, check `http://localhost:9000` (Inbucket UI) for the email; click the unsubscribe link; confirm flag flipped.
- Prod smoke after deploy: send a real chat to a second test account; confirm Resend dashboard shows the send; click Gmail's one-click unsubscribe; confirm flag flipped.

## Rollout

1. Land migration + opt-out flag (no email code yet) — safe; defaults preserve existing behavior.
2. Land email code behind `EMAIL_PROVIDER`. Set to `inbucket` in the dev `.env`; must be set to `resend` in `/opt/barter/.env.production` to actually send.
3. Add `RESEND_API_KEY` + `EMAIL_FROM` to `/opt/barter/.env.production`. Verify the existing Resend account & domain are healthy (it's already used for auth — see `deploy/README.md:160`).
4. Deploy. Smoke test as above.

No feature flag — this is core UX, not an experiment. If something goes wrong post-deploy, revert is a single deploy.

## Future work (explicitly deferred)

- Per-chat mute toggle.
- Daily digest as an alternative cadence (would replace, not supplement, the per-message email).
- PWA push notifications.
- Catching messages inserted from non-app code paths (admin tools) — not relevant in v1 since `sendMessage` is the only path.
- Tracking email opens / click-through (privacy + complexity cost not worth it on Quadra-scale).
