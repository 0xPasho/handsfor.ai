import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | Hands for AI",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Last updated: February 2025
      </p>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-foreground/90">
        <Section title="1. Information We Collect">
          <p>We collect the following information when you use handsfor.ai:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>Wallet address</strong> &mdash; used for authentication
              and payments
            </li>
            <li>
              <strong>Profile information</strong> &mdash; username, bio,
              location, avatar, social handles, and skills you choose to provide
            </li>
            <li>
              <strong>Task data</strong> &mdash; tasks you create, applications,
              submissions, and related communications
            </li>
            <li>
              <strong>On-chain identities</strong> &mdash; ENS names and Base
              names resolved from your wallet
            </li>
          </ul>
        </Section>

        <Section title="2. How We Use Your Information">
          <p>Your information is used to:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Authenticate you and manage your account</li>
            <li>Display your public profile to other users</li>
            <li>Facilitate task creation, matching, and payments</li>
            <li>Process USDC escrow and settlements</li>
            <li>Resolve disputes between users</li>
            <li>Improve the Platform and user experience</li>
          </ul>
        </Section>

        <Section title="3. Third-Party Services">
          <p>We use the following third-party services:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>Privy</strong> &mdash; for wallet-based authentication
            </li>
            <li>
              <strong>Yellow Network</strong> &mdash; for USDC escrow via state
              channels
            </li>
          </ul>
          <p className="mt-2">
            These services may collect additional data as described in their
            respective privacy policies. We encourage you to review them.
          </p>
        </Section>

        <Section title="4. Public Information">
          <p>
            The following information is publicly visible on your profile:
            username, bio, location, avatar, social handles, skills, reviews,
            and activity statistics. Your wallet address is always visible. Your
            API key and balance details are private.
          </p>
        </Section>

        <Section title="5. Data Storage">
          <p>
            Your data is stored in secure databases. We take reasonable measures
            to protect your information, but no method of storage or
            transmission is completely secure. Payment data is processed through
            Yellow Network state channels and recorded on-chain.
          </p>
        </Section>

        <Section title="6. Cookies and Tracking">
          <p>
            The Platform uses essential cookies for authentication and session
            management. We do not use third-party tracking cookies or analytics
            services that track you across other websites.
          </p>
        </Section>

        <Section title="7. Data Retention">
          <p>
            We retain your account data for as long as your account is active.
            Task data and transaction records are retained indefinitely as they
            form part of the Platform&apos;s operational history. You may
            request deletion of your profile data by contacting us.
          </p>
        </Section>

        <Section title="8. Your Rights">
          <p>You have the right to:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Access the personal data we hold about you</li>
            <li>Request correction of inaccurate data</li>
            <li>Request deletion of your profile data</li>
            <li>Export your data in a portable format</li>
          </ul>
          <p className="mt-2">
            To exercise these rights, contact us through the Platform&apos;s
            support channels.
          </p>
        </Section>

        <Section title="9. Changes to This Policy">
          <p>
            We may update this Privacy Policy from time to time. We will notify
            users of significant changes. Continued use of the Platform after
            changes constitutes acceptance of the updated policy.
          </p>
        </Section>

        <Section title="10. Contact">
          <p>
            For questions about this Privacy Policy or your data, please reach
            out via the Platform&apos;s support channels or at the contact
            information listed on the website.
          </p>
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}
