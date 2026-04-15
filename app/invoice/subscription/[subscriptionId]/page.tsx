import { redirect, notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import Image from 'next/image';
import PrintTrigger from '../../[orderId]/PrintTrigger';
import PrintButton from '../../[orderId]/PrintButton';
import '../../[orderId]/invoice-print.css';

const DAY_LABELS: Record<string, string> = {
  monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday',
  thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday',
};

export default async function SubscriptionInvoicePage({
  params,
}: {
  params: Promise<{ subscriptionId: string }>;
}) {
  const { subscriptionId } = await params;
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() {},
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/signin?next=/invoice/subscription/${subscriptionId}`);

  const { data: sub } = await supabase
    .from('subscriptions')
    .select(`
      id, style, status, payment_status, payment_reference,
      start_date, period_end_date, total_amount_rs, delivery_fee,
      delivery_time_slot, created_at,
      users!inner ( full_name, email, phone ),
      subscription_plans ( name, price_per_bowl ),
      addresses ( line1, line2, city, state, pincode ),
      subscription_day_configs ( day_of_week, bowl_slug, quantity, customization_cost_rs, customizations )
    `)
    .eq('id', subscriptionId)
    .eq('user_id', user.id)
    .single();

  if (!sub) notFound();
  if (sub.payment_status !== 'paid') redirect('/');

  const s = sub as any;
  const invoiceNumber = `NV-SUB-${s.id.slice(-8).toUpperCase()}`;
  const paidOn = new Date(s.created_at).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
  const periodStart = s.start_date
    ? new Date(s.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—';
  const periodEnd = s.period_end_date
    ? new Date(s.period_end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—';

  const plan = s.subscription_plans as any;
  const userInfo = s.users as any;
  const address = s.addresses as any;
  const dayConfigs = (s.subscription_day_configs ?? []) as any[];

  // Compute totals
  const pricePerBowl = plan?.price_per_bowl ?? 0;
  const bowlsSubtotal = dayConfigs.reduce(
    (acc: number, dc: any) => acc + pricePerBowl * dc.quantity,
    0
  );
  const customisationTotal = dayConfigs.reduce(
    (acc: number, dc: any) => acc + (dc.customization_cost_rs ?? 0),
    0
  );
  const uniqueDeliveryDays = s.style === 'spread'
    ? new Set(dayConfigs.map((dc: any) => dc.day_of_week)).size
    : 0;
  const paidTotal = Number(s.total_amount_rs ?? 0);
  const explicitWeeklyDeliveryFee = (s.delivery_fee ?? 0) * uniqueDeliveryDays;
  const inferredWeeklyDeliveryFee =
    s.style === 'spread'
      ? Math.max(0, paidTotal - (bowlsSubtotal + customisationTotal))
      : 0;
  const weeklyDeliveryFee = explicitWeeklyDeliveryFee > 0 ? explicitWeeklyDeliveryFee : inferredWeeklyDeliveryFee;

  return (
    <>
      <PrintTrigger />

      <div className="print-hide bg-ink text-white py-3 px-6 flex items-center justify-between sticky top-0 z-50">
        <p className="font-body text-sm text-white/70">
          Subscription Invoice — <span className="font-bold text-white">{invoiceNumber}</span>
        </p>
        <PrintButton />
      </div>

      <div
        className="invoice-page bg-white mx-auto my-8 print:my-0 shadow-2xl"
        style={{ maxWidth: '210mm', minHeight: '297mm', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ height: '6px', background: 'linear-gradient(90deg, #7D9B76 0%, #4E6B49 50%, #C4714A 100%)', flexShrink: 0 }} />

        <div style={{ flex: 1, padding: '36px 48px 32px' }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Image
                src="/Nutravoe Logo.png"
                alt="Nutravoe"
                width={40}
                height={40}
                style={{ width: '38px', height: '38px', objectFit: 'contain' }}
              />
              <span style={{
                fontFamily: 'var(--font-display, Georgia, serif)',
                fontSize: '26px', fontWeight: '300', letterSpacing: '0.3em',
                color: '#1C1C1A', textTransform: 'lowercase', lineHeight: 1,
              }}>
                nutravoe
              </span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontFamily: 'Georgia, serif', fontSize: '34px', fontWeight: '300', color: '#7D9B76', letterSpacing: '-0.02em', lineHeight: 1 }}>
                INVOICE
              </p>
              <p style={{ fontFamily: 'sans-serif', fontSize: '11px', color: '#9A9590', fontWeight: '500', marginTop: '4px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Subscription
              </p>
              <p style={{ fontFamily: 'sans-serif', fontSize: '13px', color: '#1C1C1A', fontWeight: '700', marginTop: '4px', letterSpacing: '0.04em' }}>
                {invoiceNumber}
              </p>
            </div>
          </div>

          <p style={{ fontSize: '11px', color: '#BFBBB6', fontFamily: 'sans-serif', lineHeight: '1.7', marginBottom: '32px' }}>
            Domlur Kitchen, Victoria II Apartment · 314/8 Patel Ram Reddy Rd, Domlur, Bengaluru 560071<br />
            nutravoe.in · @nutravoe
          </p>

          {/* Meta */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: '#F9F8F6', borderLeft: '3px solid #7D9B76',
            borderRadius: '0 8px 8px 0', padding: '12px 16px', marginBottom: '28px',
          }}>
            <MetaItem label="Payment Date" value={paidOn} />
            <MetaItem label="Plan" value={plan?.name ?? '—'} />
            <MetaItem label="Style" value={s.style === 'spread' ? 'Spread across week' : 'Flexible wallet'} />
            <MetaItem label="Status" value="PAID" valueColor="#4E6B49" bold />
          </div>

          {/* Period (for spread) */}
          {s.style === 'spread' && s.start_date && (
            <div style={{
              display: 'flex', gap: '32px',
              background: '#F0F5EF', border: '1px solid #B8CDB4',
              borderRadius: '8px', padding: '12px 18px', marginBottom: '28px',
            }}>
              <MetaItem label="Subscription From" value={periodStart} />
              <MetaItem label="Subscription To" value={periodEnd} />
              {s.delivery_time_slot && <MetaItem label="Delivery Slot" value={s.delivery_time_slot} />}
            </div>
          )}

          {/* Bill To / Address */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', marginBottom: '28px' }}>
            <div>
              <SectionLabel>Bill To</SectionLabel>
              <p style={nameStyle}>{userInfo.full_name}</p>
              <p style={detailStyle}>{userInfo.email}</p>
              {userInfo.phone && <p style={detailStyle}>{userInfo.phone}</p>}
            </div>
            {address && (
              <div>
                <SectionLabel>Delivery Address</SectionLabel>
                <p style={nameStyle}>{address.line1}</p>
                {address.line2 && <p style={detailStyle}>{address.line2}</p>}
                <p style={detailStyle}>
                  {address.city}{address.state ? `, ${address.state}` : ''} — {address.pincode}
                </p>
              </div>
            )}
          </div>

          <div style={{ height: '1px', background: '#E8E5E0', marginBottom: '24px' }} />

          {/* Items table — for spread show day-by-day config */}
          {s.style === 'spread' && dayConfigs.length > 0 ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px' }}>
              <thead>
                <tr style={{ background: '#1C1C1A' }}>
                  <Th align="left" width="22%">Day</Th>
                  <Th align="left" width="30%">Bowl</Th>
                  <Th align="center" width="8%">Qty</Th>
                  <Th align="right" width="16%">Unit Price</Th>
                  <Th align="right" width="16%">Customisation</Th>
                  <Th align="right" width="18%">Line Total</Th>
                </tr>
              </thead>
              <tbody>
                {dayConfigs.map((dc: any, idx: number) => {
                  const lineTotal = (pricePerBowl * dc.quantity) + (dc.customization_cost_rs ?? 0);
                  const added = dc.customizations?.added ?? [];
                  const removed = dc.customizations?.removed ?? [];
                  return (
                    <tr key={idx} style={{
                      background: idx % 2 === 0 ? '#FDFCFA' : '#FFFFFF',
                      borderBottom: '1px solid #F0EDE8',
                    }}>
                      <td style={{ padding: '11px 14px', fontSize: '13px', color: '#1C1C1A', fontFamily: 'sans-serif', fontWeight: '500' }}>
                        {DAY_LABELS[dc.day_of_week] ?? dc.day_of_week}
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        <p style={{ fontSize: '13px', color: '#1C1C1A', fontFamily: 'sans-serif', fontWeight: '500' }}>
                          {dc.bowl_slug}
                        </p>
                        {removed.length > 0 && (
                          <p style={{ fontSize: '11px', color: '#C4714A', marginTop: '2px', fontFamily: 'sans-serif' }}>
                            − {removed.join(', ')}
                          </p>
                        )}
                        {added.length > 0 && (
                          <p style={{ fontSize: '11px', color: '#4E6B49', marginTop: '2px', fontFamily: 'sans-serif' }}>
                            + {added.join(', ')}
                          </p>
                        )}
                      </td>
                      <Td align="center">{dc.quantity}</Td>
                      <Td align="right" muted>₹ {pricePerBowl.toLocaleString('en-IN')}</Td>
                      <Td align="right" muted>
                        {(dc.customization_cost_rs ?? 0) > 0
                          ? `₹ ${(dc.customization_cost_rs).toLocaleString('en-IN')}`
                          : '—'}
                      </Td>
                      <Td align="right" bold>₹ {lineTotal.toLocaleString('en-IN')}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : s.style === 'flexible' ? (
            <div style={{
              background: '#F9F8F6', borderRadius: '8px', padding: '20px 24px', marginBottom: '24px',
              border: '1px solid #E8E5E0',
            }}>
              <p style={{ fontSize: '13px', color: '#1C1C1A', fontFamily: 'sans-serif', fontWeight: '600', marginBottom: '6px' }}>
                {plan?.name ?? 'Flexible Plan'}
              </p>
              <p style={{ fontSize: '12px', color: '#9A9590', fontFamily: 'sans-serif', lineHeight: 1.6 }}>
                Wallet loaded with ₹ {Number(s.total_amount_rs).toLocaleString('en-IN')}. Use it to order bowls at your own pace
                {s.period_end_date ? ` — valid until ${periodEnd}` : ''}.
              </p>
            </div>
          ) : null}

          {/* Totals */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '28px' }}>
            <div style={{ minWidth: '280px' }}>
              {s.style === 'spread' ? (
                <>
                  <TotalRow label="Bowls subtotal / week" value={`₹ ${bowlsSubtotal.toLocaleString('en-IN')}`} />
                  {customisationTotal > 0 && (
                    <TotalRow label="Customisations / week" value={`₹ ${customisationTotal.toLocaleString('en-IN')}`} />
                  )}
                  <TotalRow
                    label={
                      weeklyDeliveryFee > 0
                        ? `Delivery (${uniqueDeliveryDays} day${uniqueDeliveryDays > 1 ? 's' : ''} × ₹${s.delivery_fee}/day)`
                        : "Delivery"
                    }
                    value={weeklyDeliveryFee > 0 ? `₹ ${weeklyDeliveryFee.toLocaleString('en-IN')}` : "Free"}
                    valueColor={weeklyDeliveryFee === 0 ? "#4E6B49" : undefined}
                  />
                  {weeklyDeliveryFee > 0 && (
                    <TotalRow
                      label={`  Total delivery cost (Nutravoe covers ₹${weeklyDeliveryFee.toLocaleString('en-IN')})`}
                      value={`₹ ${(weeklyDeliveryFee * 2).toLocaleString('en-IN')}`}
                      valueColor="#9A9590"
                      small
                    />
                  )}
                </>
              ) : (
                <TotalRow label="Wallet amount loaded" value={`₹ ${paidTotal.toLocaleString('en-IN')}`} />
              )}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 14px', background: '#1C1C1A', borderRadius: '8px', marginTop: '8px',
              }}>
                <span style={{ fontSize: '12px', fontWeight: '700', color: 'white', letterSpacing: '0.08em', fontFamily: 'sans-serif' }}>
                  {s.style === 'spread' ? 'WEEKLY TOTAL' : 'TOTAL PAID'}
                </span>
                <span style={{ fontSize: '20px', fontWeight: '400', color: 'white', fontFamily: 'Georgia, serif' }}>
                  ₹ {paidTotal.toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          </div>

          {/* Payment info */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 18px', background: '#F0F5EF',
            border: '1px solid #B8CDB4', borderRadius: '8px', marginBottom: '32px',
          }}>
            <div>
              <p style={{ fontSize: '10px', color: '#7D9B76', fontWeight: '700', letterSpacing: '0.1em', fontFamily: 'sans-serif', textTransform: 'uppercase', marginBottom: '3px' }}>
                Payment Method
              </p>
              <p style={{ fontSize: '13px', color: '#1C1C1A', fontFamily: 'sans-serif', fontWeight: '500' }}>
                WhatsApp / UPI
              </p>
            </div>
            {s.payment_reference && (
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: '10px', color: '#7D9B76', fontWeight: '700', letterSpacing: '0.1em', fontFamily: 'sans-serif', textTransform: 'uppercase', marginBottom: '3px' }}>
                  Reference
                </p>
                <p style={{ fontSize: '13px', color: '#1C1C1A', fontFamily: 'sans-serif', fontWeight: '500' }}>
                  {s.payment_reference}
                </p>
              </div>
            )}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              background: '#4E6B49', color: 'white', borderRadius: '999px',
              padding: '5px 16px', fontSize: '12px', fontWeight: '700',
              letterSpacing: '0.06em', fontFamily: 'sans-serif',
            }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              PAID
            </div>
          </div>

          <div style={{ height: '1px', background: '#E8E5E0', marginBottom: '24px' }} />

          {/* Footer */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: '15px', color: '#1C1C1A', fontFamily: 'Georgia, serif', fontStyle: 'italic', marginBottom: '6px' }}>
                Eat well, feel good!
              </p>
              <p style={{ fontSize: '12px', color: '#9A9590', fontFamily: 'sans-serif' }}>
                Thank you for choosing us — Nutravoe family
              </p>
            </div>
            <Image
              src="/Nutravoe Logo.png"
              alt="Nutravoe"
              width={56}
              height={56}
              style={{ width: '52px', height: '52px', objectFit: 'contain', opacity: 0.15 }}
            />
          </div>

        </div>

        <div style={{ height: '6px', background: 'linear-gradient(90deg, #C4714A 0%, #7D9B76 100%)', flexShrink: 0 }} />
      </div>
    </>
  );
}

/* ── Sub-components ─────────────────────────────────────── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: '10px', fontWeight: '700', color: '#7D9B76', letterSpacing: '0.14em', textTransform: 'uppercase', fontFamily: 'sans-serif', marginBottom: '8px' }}>
      {children}
    </p>
  );
}

function MetaItem({ label, value, valueColor, bold }: { label: string; value: string; valueColor?: string; bold?: boolean }) {
  return (
    <div>
      <p style={{ fontSize: '10px', color: '#9A9590', fontFamily: 'sans-serif', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '3px' }}>
        {label}
      </p>
      <p style={{ fontSize: '14px', color: valueColor ?? '#1C1C1A', fontFamily: 'sans-serif', fontWeight: bold ? '700' : '500' }}>
        {value}
      </p>
    </div>
  );
}

function Th({ children, align, width }: { children: React.ReactNode; align: 'left' | 'center' | 'right'; width?: string }) {
  return (
    <th style={{ padding: '10px 14px', textAlign: align, width, fontSize: '10px', fontWeight: '700', color: 'white', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'sans-serif' }}>
      {children}
    </th>
  );
}

function Td({ children, align, muted, bold }: { children: React.ReactNode; align: 'left' | 'center' | 'right'; muted?: boolean; bold?: boolean }) {
  return (
    <td style={{ padding: '11px 14px', textAlign: align, fontSize: '13px', fontFamily: 'sans-serif', color: muted ? '#9A9590' : '#1C1C1A', fontWeight: bold ? '600' : '400' }}>
      {children}
    </td>
  );
}

function TotalRow({ label, value, valueColor, small }: { label: string; value: string; valueColor?: string; small?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 14px' }}>
      <span style={{ fontSize: small ? '11px' : '12px', color: '#9A9590', fontFamily: 'sans-serif' }}>{label}</span>
      <span style={{ fontSize: small ? '12px' : '13px', color: valueColor ?? '#1C1C1A', fontFamily: 'sans-serif', fontWeight: '500' }}>{value}</span>
    </div>
  );
}

const nameStyle: React.CSSProperties = { fontSize: '14px', fontWeight: '600', color: '#1C1C1A', fontFamily: 'sans-serif', marginBottom: '4px' };
const detailStyle: React.CSSProperties = { fontSize: '12px', color: '#9A9590', fontFamily: 'sans-serif', lineHeight: '1.65' };
