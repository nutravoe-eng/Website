export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-28 text-ink">
      <h1 className="mb-8 font-display text-4xl">Privacy Notice</h1>
      
      <div className="space-y-6 font-body text-[14px] leading-relaxed text-stone">
        <p><strong>Last Updated: {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</strong></p>

        <section>
          <h2 className="mb-3 font-display text-2xl text-ink">1. Information We Collect</h2>
          <p>
            When you use Nutravoe, we collect information you provide directly to us, including your name, email address, phone number, delivery address, dietary preferences, and payment information. We also collect data regarding your subscriptions, wallet balances, and order history.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-display text-2xl text-ink">2. How We Use Your Information</h2>
          <p>We use the information we collect to:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Process and fulfill your orders and subscriptions.</li>
            <li>Manage your Nutravoe Wallet and process payments.</li>
            <li>Send transactional communications, such as delivery updates.</li>
            <li>Improve our products and customer service.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-display text-2xl text-ink">3. Information Sharing</h2>
          <p>
            We do not sell your personal data. We may share necessary information with trusted third-party service providers (such as payment processors and delivery partners) solely for the purpose of fulfilling your orders.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-display text-2xl text-ink">4. Data Security</h2>
          <p>
            We implement industry-standard security measures to protect your personal and payment information. Sensitive payment data is handled exclusively by compliant third-party processors.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-display text-2xl text-ink">5. Your Choices</h2>
          <p>
            You may update your personal information or deactivate your account at any time through your dashboard. If you wish to permanently delete your data from our systems, please contact support.
          </p>
        </section>
      </div>
    </div>
  );
}
