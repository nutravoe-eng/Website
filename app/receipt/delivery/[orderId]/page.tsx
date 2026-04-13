import { redirect, notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import Image from 'next/image';
import PrintTrigger from '../../../invoice/[orderId]/PrintTrigger';
import PrintButton from '../../../invoice/[orderId]/PrintButton';
import '../../../invoice/[orderId]/invoice-print.css';

interface Customizations {
  removed?: string[];
  added?: string[];
}

export default async function DeliveryReceiptPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
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
  if (!user) redirect(`/signin?next=/receipt/delivery/${orderId}`);

  const { data: order } = await supabase
    .from('orders')
    .select(`
      id, status, delivery_date, created_at, subscription_id, order_type,
      delivery_fee, subtotal, total,
      users!inner ( full_name, email, phone ),
      addresses ( line1, line2, city, state, pincode ),
      order_items ( bowl_name, quantity, unit_price, total_price, customizations ),
      subscriptions ( id, subscription_plans ( name ) )
    `)
    .eq('id', orderId)
    .eq('user_id', user.id)
    .single();

  if (!order) notFound();
  // Only subscription delivery orders get a receipt here
  if (!order.subscription_id && order.order_type !== 'subscription') redirect(`/invoice/${orderId}`);
  if (order.status !== 'delivered') redirect('/');

  const o = order as any;
  const receiptNumber = `NV-DEL-${o.id.slice(-8).toUpperCase()}`;
  const subscriptionRef = o.subscription_id
    ? `NV-SUB-${o.subscription_id.slice(-8).toUpperCase()}`
    : null;

  const deliveryDate = new Date(o.delivery_date).toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const userInfo = o.users as any;
  const address = o.addresses as any;
  const items = (o.order_items ?? []) as any[];
  const planName = o.subscriptions?.subscription_plans?.name ?? null;
  const subtotal = Number(o.subtotal ?? 0);
  const inferredDeliveryFee = Math.max(0, Number(o.total ?? 0) - subtotal);
  const deliveryFee = Number(o.delivery_fee ?? 0) > 0 ? Number(o.delivery_fee) : inferredDeliveryFee;
  const total = Number(o.total ?? subtotal + deliveryFee);

  return (
    <>
      <PrintTrigger />

      <div className="print-hide bg-ink text-white py-3 px-6 flex items-center justify-between sticky top-0 z-50">
        <p className="font-body text-sm text-white/70">
          Delivery Receipt — <span className="font-bold text-white">{receiptNumber}</span>
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
                src="/circular-logo-print-2400px.png"
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
                RECEIPT
              </p>
              <p style={{ fontFamily: 'sans-serif', fontSize: '11px', color: '#9A9590', fontWeight: '500', marginTop: '4px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Delivery
              </p>
              <p style={{ fontFamily: 'sans-serif', fontSize: '13px', color: '#1C1C1A', fontWeight: '700', marginTop: '4px', letterSpacing: '0.04em' }}>
                {receiptNumber}
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
            <MetaItem label="Delivered On" value={deliveryDate} />
            {planName && <MetaItem label="Plan" value={planName} />}
            {subscriptionRef && <MetaItem label="Subscription Ref" value={subscriptionRef} />}
            <MetaItem label="Status" value="DELIVERED" valueColor="#4E6B49" bold />
          </div>

          {/* Delivered To / Address */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', marginBottom: '28px' }}>
            <div>
              <SectionLabel>Delivered To</SectionLabel>
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

          {/* Items table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '28px' }}>
            <thead>
              <tr style={{ background: '#1C1C1A' }}>
                <Th align="left" width="50%">Bowl</Th>
                <Th align="center" width="10%">Qty</Th>
                <Th align="right" width="20%">Unit Price</Th>
                <Th align="right" width="20%">Customisation</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((item: any, idx: number) => {
                const customizations = item.customizations as Customizations | null;
                const customCost = Number(item.total_price) - (Number(item.unit_price) * item.quantity);
                return (
                  <tr key={idx} style={{
                    background: idx % 2 === 0 ? '#FDFCFA' : '#FFFFFF',
                    borderBottom: '1px solid #F0EDE8',
                  }}>
                    <td style={{ padding: '11px 14px' }}>
                      <p style={{ fontSize: '13px', color: '#1C1C1A', fontWeight: '500', fontFamily: 'sans-serif' }}>
                        {item.bowl_name}
                      </p>
                      {customizations?.removed && customizations.removed.length > 0 && (
                        <p style={{ fontSize: '11px', color: '#C4714A', marginTop: '2px', fontFamily: 'sans-serif' }}>
                          − {customizations.removed.join(', ')}
                        </p>
                      )}
                      {customizations?.added && customizations.added.length > 0 && (
                        <p style={{ fontSize: '11px', color: '#4E6B49', marginTop: '2px', fontFamily: 'sans-serif' }}>
                          + {customizations.added.join(', ')}
                        </p>
                      )}
                    </td>
                    <Td align="center">{item.quantity}</Td>
                    <Td align="right" muted>₹ {Number(item.unit_price).toLocaleString('en-IN')}</Td>
                    <Td align="right" muted>
                      {customCost > 0 ? `₹ ${customCost.toLocaleString('en-IN')}` : '—'}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Totals */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '28px' }}>
            <div style={{ minWidth: '270px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 14px' }}>
                <span style={{ fontSize: '12px', color: '#9A9590', fontFamily: 'sans-serif' }}>Subtotal</span>
                <span style={{ fontSize: '13px', color: '#1C1C1A', fontFamily: 'sans-serif', fontWeight: '500' }}>
                  ₹ {subtotal.toLocaleString('en-IN')}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 14px' }}>
                <span style={{ fontSize: '12px', color: '#9A9590', fontFamily: 'sans-serif' }}>Delivery</span>
                <span style={{ fontSize: '13px', color: deliveryFee === 0 ? '#4E6B49' : '#1C1C1A', fontFamily: 'sans-serif', fontWeight: '500' }}>
                  {deliveryFee === 0 ? 'Free' : `₹ ${deliveryFee.toLocaleString('en-IN')}`}
                </span>
              </div>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 14px', background: '#1C1C1A', borderRadius: '8px', marginTop: '8px',
              }}>
                <span style={{ fontSize: '12px', fontWeight: '700', color: 'white', letterSpacing: '0.08em', fontFamily: 'sans-serif' }}>
                  DELIVERY TOTAL
                </span>
                <span style={{ fontSize: '20px', fontWeight: '400', color: 'white', fontFamily: 'Georgia, serif' }}>
                  ₹ {total.toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          </div>

          {/* Covered by subscription callout */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '14px',
            padding: '14px 18px', background: '#F0F5EF',
            border: '1px solid #B8CDB4', borderRadius: '8px', marginBottom: '32px',
          }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '50%', background: '#4E6B49',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div>
              <p style={{ fontSize: '13px', color: '#1C1C1A', fontFamily: 'sans-serif', fontWeight: '600', marginBottom: '2px' }}>
                Covered by your subscription
              </p>
              <p style={{ fontSize: '12px', color: '#9A9590', fontFamily: 'sans-serif' }}>
                This delivery is fulfilled under subscription {subscriptionRef ?? ''}
                {planName ? ` · ${planName}` : ''}.
              </p>
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
              src="/circular-logo-print-2400px.png"
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

const nameStyle: React.CSSProperties = { fontSize: '14px', fontWeight: '600', color: '#1C1C1A', fontFamily: 'sans-serif', marginBottom: '4px' };
const detailStyle: React.CSSProperties = { fontSize: '12px', color: '#9A9590', fontFamily: 'sans-serif', lineHeight: '1.65' };
