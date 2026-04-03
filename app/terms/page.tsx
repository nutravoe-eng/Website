export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-28 text-ink">
      <h1 className="mb-8 font-display text-4xl">Conditions of Use</h1>
      
      <div className="space-y-6 font-body text-[14px] leading-relaxed text-stone">
        <p><strong>Last Updated: {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</strong></p>

        <section>
          <h2 className="mb-3 font-display text-2xl text-ink">1. Agreement to Terms</h2>
          <p>
            By accessing or placing an order with Nutravoe, you agree to be bound by these Conditions of Use. If you do not agree, please do not use our services.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-display text-2xl text-ink">2. Orders and Subscriptions</h2>
          <p>
            All orders are subject to availability. Our subscription plans (Flexible and Spread Across The Week) are billed according to your selected schedule. By purchasing a subscription, you authorize us to load the corresponding funds into your Nutravoe Wallet and schedule your deliveries.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-display text-2xl text-ink">3. Nutravoe Wallet</h2>
          <p>
            The Nutravoe Wallet holds promotional credits, refunds, and prepaid subscription funds. Wallet balances are non-transferable and can only be used for purchases within the Nutravoe platform. Promotional credits may have an expiry date as indicated in your account dashboard.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-display text-2xl text-ink">4. Cancellations and Refunds</h2>
          <p>
            You may cancel an order or scheduled delivery prior to our processing cut-off limits. Eligible cancellations will instantly refund the transaction amount back into your Nutravoe Wallet. For permanent account closures and fiat refunds, please contact our support team.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-display text-2xl text-ink">5. Modifications</h2>
          <p>
            We reserve the right to update these terms at any time. Continued use of the platform following any changes indicates your acceptance of the new terms.
          </p>
        </section>
      </div>
    </div>
  );
}
