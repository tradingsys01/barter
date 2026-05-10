import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service | Quadra Barter",
  description: "Terms and conditions for using the Quadra Barter platform.",
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-8 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Terms of Service</h1>
        <p className="mt-1 text-sm text-zinc-500">Last updated: May 9, 2026</p>
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-medium text-zinc-900">1. Acceptance of Terms</h2>
        <p className="text-zinc-700">
          By accessing or using Quadra Barter ("the Platform"), you agree to be bound by these Terms of Service. If you do not agree to these terms, do not use the Platform.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium text-zinc-900">2. About the Platform</h2>
        <p className="text-zinc-700">
          Quadra Barter is a community platform that facilitates the exchange of goods and services through barter (swap) arrangements only. The Platform does not facilitate monetary transactions. All exchanges arranged through the Platform occur directly between users without Platform involvement.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium text-zinc-900">3. User Responsibilities</h2>
        <p className="text-zinc-700">By using the Platform, you agree to:</p>
        <ul className="list-disc space-y-2 pl-5 text-zinc-700">
          <li>Provide accurate information in your listings and profile</li>
          <li>Only post items or services you have the right to exchange</li>
          <li>Communicate honestly and respectfully with other users</li>
          <li>Complete barter arrangements you agree to in good faith</li>
          <li>Not use the Platform for illegal activities</li>
          <li>Not post prohibited items (see Section 5)</li>
          <li>Be solely responsible for assessing the value and condition of items you exchange</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium text-zinc-900">4. Platform Role and Limitations</h2>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="font-medium text-amber-900">Important Disclaimer</p>
          <p className="mt-2 text-sm text-amber-800">
            Quadra Barter is a venue that connects users. We do not participate in, verify, guarantee, or endorse any barter transaction. All exchanges are conducted entirely at your own risk.
          </p>
        </div>
        <div className="space-y-3 text-zinc-700">
          <p>The Platform does NOT:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>Verify the identity, background, or trustworthiness of users</li>
            <li>Inspect, verify, or guarantee the quality, safety, or legality of listed items or services</li>
            <li>Guarantee that users will complete agreed-upon exchanges</li>
            <li>Mediate or resolve disputes between users</li>
            <li>Provide insurance or protection for any exchange</li>
            <li>Verify the accuracy of listing descriptions or images</li>
          </ul>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium text-zinc-900">5. Prohibited Items and Activities</h2>
        <p className="text-zinc-700">The following are prohibited on the Platform:</p>
        <ul className="list-disc space-y-2 pl-5 text-zinc-700">
          <li>Illegal items or services</li>
          <li>Weapons, firearms, or explosives</li>
          <li>Controlled substances, drugs, or drug paraphernalia</li>
          <li>Stolen property</li>
          <li>Counterfeit or pirated goods</li>
          <li>Hazardous materials</li>
          <li>Items subject to recall</li>
          <li>Services that are illegal in British Columbia</li>
          <li>Fraudulent, misleading, or deceptive listings</li>
          <li>Spam, harassment, or abusive behavior</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium text-zinc-900">6. Fraud and Scam Disclaimer</h2>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="font-medium text-red-900">User Beware</p>
          <p className="mt-2 text-sm text-red-800">
            Quadra Barter is not responsible for any fraud, scams, misrepresentation, theft, or disputes arising from exchanges arranged through the Platform. Users are solely responsible for verifying the identity of other parties and the authenticity and condition of items before completing any exchange.
          </p>
        </div>
        <div className="space-y-3 text-zinc-700">
          <p>We strongly recommend:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>Meeting in safe, public locations for exchanges</li>
            <li>Inspecting items thoroughly before completing a swap</li>
            <li>Trusting your instincts — if something seems wrong, walk away</li>
            <li>Not sharing personal financial or sensitive information</li>
            <li>Reporting suspicious users or listings to us</li>
          </ul>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium text-zinc-900">7. Limitation of Liability</h2>
        <p className="text-zinc-700">
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, QUADRA BARTER AND ITS OPERATORS SHALL NOT BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM:
        </p>
        <ul className="list-disc space-y-2 pl-5 text-zinc-700">
          <li>Your use of or inability to use the Platform</li>
          <li>Any transaction or exchange arranged through the Platform</li>
          <li>Any conduct of other users, whether online or offline</li>
          <li>Any content posted on the Platform</li>
          <li>Unauthorized access to your account or data</li>
          <li>Any loss, damage, or injury resulting from barter exchanges</li>
        </ul>
        <p className="text-zinc-700">
          The Platform is provided "as is" without warranties of any kind, express or implied.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium text-zinc-900">8. Indemnification</h2>
        <p className="text-zinc-700">
          You agree to indemnify and hold harmless Quadra Barter and its operators from any claims, damages, losses, or expenses arising from your use of the Platform, your violation of these terms, or your barter transactions with other users.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium text-zinc-900">9. Account Termination</h2>
        <p className="text-zinc-700">
          We reserve the right to suspend or terminate accounts that violate these terms, post prohibited content, or engage in behavior that harms the community. You may delete your account at any time.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium text-zinc-900">10. Listing Expiration</h2>
        <p className="text-zinc-700">
          Listings automatically expire after 30 days of inactivity. You will receive email reminders before expiration and may renew your listings at any time.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium text-zinc-900">11. Governing Law</h2>
        <p className="text-zinc-700">
          These terms are governed by the laws of British Columbia, Canada. Any disputes shall be resolved in the courts of British Columbia.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium text-zinc-900">12. Changes to Terms</h2>
        <p className="text-zinc-700">
          We may modify these terms at any time. Continued use of the Platform after changes constitutes acceptance of the new terms.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium text-zinc-900">13. Contact</h2>
        <p className="text-zinc-700">
          For questions about these terms, please use our{" "}
          <Link href="/feedback" className="text-emerald-600 underline hover:text-emerald-700">
            feedback form
          </Link>
          .
        </p>
      </section>

      <div className="border-t border-zinc-200 pt-6">
        <Link href="/privacy" className="text-sm text-emerald-600 hover:text-emerald-700">
          View Privacy Policy →
        </Link>
      </div>
    </main>
  );
}
