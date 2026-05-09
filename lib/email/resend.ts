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
    const { sendViaInbucket } = await import("./inbucket");
    await sendViaInbucket({ from, ...input });
    return;
  }

  throw new Error(`Unknown EMAIL_PROVIDER: ${provider}`);
}
