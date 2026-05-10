import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | Quadra Barter",
  description: "How Quadra Barter collects, uses, and protects your information.",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-8 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Privacy Policy</h1>
        <p className="mt-1 text-sm text-zinc-500">Last updated: May 9, 2026</p>
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-medium text-zinc-900">1. Introduction</h2>
        <p className="text-zinc-700">
          Quadra Barter ("we," "our," or "the Platform") is a community barter platform enabling residents and visitors of Quadra Island, BC to swap goods and services without monetary exchange. This Privacy Policy explains how we collect, use, and protect your personal information.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium text-zinc-900">2. Information We Collect</h2>
        <div className="space-y-3 text-zinc-700">
          <p><strong>Account Information:</strong> When you create an account, we collect your email address and optional display name.</p>
          <p><strong>Listing Content:</strong> Information you provide when posting listings, including descriptions, images, and categories.</p>
          <p><strong>Messages:</strong> Communications exchanged through our chat feature to facilitate barter arrangements.</p>
          <p><strong>Usage Data:</strong> Basic analytics about how you interact with the Platform, including pages visited and features used.</p>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium text-zinc-900">3. How We Use Your Information</h2>
        <ul className="list-disc space-y-2 pl-5 text-zinc-700">
          <li>To provide and maintain the barter platform</li>
          <li>To facilitate communication between users arranging swaps</li>
          <li>To send important notifications about your listings or account</li>
          <li>To improve the Platform based on usage patterns</li>
          <li>To prevent abuse and maintain community safety</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium text-zinc-900">4. Information Sharing</h2>
        <div className="space-y-3 text-zinc-700">
          <p>We do not sell your personal information. We may share limited information:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li><strong>With other users:</strong> Your display name and listing content are visible to facilitate barter arrangements.</li>
            <li><strong>Service providers:</strong> We use third-party services (hosting, email) that process data on our behalf.</li>
            <li><strong>Legal requirements:</strong> When required by law or to protect our rights and safety.</li>
          </ul>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium text-zinc-900">5. Data Security</h2>
        <p className="text-zinc-700">
          We implement reasonable security measures to protect your information. However, no internet transmission is completely secure. You are responsible for maintaining the confidentiality of your account credentials.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium text-zinc-900">6. Data Retention</h2>
        <p className="text-zinc-700">
          We retain your information for as long as your account is active. You may request deletion of your account and associated data by contacting us. Some information may be retained as required by law or for legitimate business purposes.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium text-zinc-900">7. Your Rights</h2>
        <p className="text-zinc-700">You have the right to:</p>
        <ul className="list-disc space-y-2 pl-5 text-zinc-700">
          <li>Access and receive a copy of your personal data</li>
          <li>Correct inaccurate information</li>
          <li>Request deletion of your account</li>
          <li>Opt out of non-essential communications</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium text-zinc-900">8. Cookies</h2>
        <p className="text-zinc-700">
          We use essential cookies to maintain your session and preferences. These are necessary for the Platform to function and cannot be disabled.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium text-zinc-900">9. Changes to This Policy</h2>
        <p className="text-zinc-700">
          We may update this Privacy Policy from time to time. We will notify users of significant changes via email or a notice on the Platform.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium text-zinc-900">10. Contact</h2>
        <p className="text-zinc-700">
          For privacy-related questions or requests, please use our{" "}
          <Link href="/feedback" className="text-emerald-600 underline hover:text-emerald-700">
            feedback form
          </Link>
          .
        </p>
      </section>

      <div className="border-t border-zinc-200 pt-6">
        <Link href="/terms" className="text-sm text-emerald-600 hover:text-emerald-700">
          View Terms of Service →
        </Link>
      </div>
    </main>
  );
}
