import { redirect, notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import Image from 'next/image';
import PrintTrigger from './PrintTrigger';
import PrintButton from './PrintButton';
import './invoice-print.css';

interface Customizations {
  removed?: string[];
  added?: string[];
}

interface OrderItem {
  bowl_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  customizations: Customizations | null;
}

interface OrderData {
  id: string;
  status: string;
  payment_status: string;
  payment_method: string | null;
  payment_reference: string | null;
  delivery_date: string;
  delivery_fee: number;
  subtotal: number;
  total: number;
  created_at: string;
  users: { full_name: string; email: string; phone: string | null };
  addresses: { line1: string; line2: string | null; city: string; state: string | null; pincode: string } | null;
  order_items: OrderItem[];
}

export default async function InvoicePage({
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
  if (!user) redirect(`/signin?next=/invoice/${orderId}`);

  const { data: order } = await supabase
    .from('orders')
    .select(`
      id, status, payment_status, payment_method, payment_reference,
      delivery_date, delivery_fee, subtotal, total, created_at,
      users!inner ( full_name, email, phone ),
      addresses ( line1, line2, city, state, pincode ),
      order_items ( bowl_name, quantity, unit_price, total_price, customizations )
    `)
    .eq('id', orderId)
    .eq('user_id', user.id)
    .single();

  if (!order) notFound();
  if (order.status !== 'delivered' || order.payment_status !== 'paid') redirect('/orders');

  const o = order as unknown as OrderData;

  const invoiceNumber = `NV-INV-${o.id.slice(-8).toUpperCase()}`;
  const orderDate = new Date(o.created_at).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
  const deliveredOn = new Date(o.delivery_date).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  const paymentLabel: Record<string, string> = {
    whatsapp_cod: 'WhatsApp / UPI',
    upi: 'UPI',
    wallet: 'Wallet',
    razorpay: 'Online Payment',
    cod: 'Cash on Delivery',
  };

  // Subscriber discount = raw items sum minus stored subtotal
  const rawItemsTotal = o.order_items.reduce((s, i) => s + i.total_price, 0);
  const discount = Math.max(0, rawItemsTotal - Number(o.subtotal));

  return (
    <>
      <PrintTrigger />

      {/* Screen-only top bar */}
      <div className="print-hide bg-ink text-white py-3 px-6 flex items-center justify-between sticky top-0 z-50">
        <p className="font-body text-sm text-white/70">
          Invoice — <span className="font-bold text-white">{invoiceNumber}</span>
        </p>
        <PrintButton />
      </div>

      {/* ── Invoice page ───────────────────────────────────── */}
      <div
        className="invoice-page bg-white mx-auto my-8 print:my-0 shadow-2xl"
        style={{ maxWidth: '210mm', minHeight: '297mm', display: 'flex', flexDirection: 'column' }}
      >
        {/* Top accent bar — flush to edge */}
        <div style={{ height: '6px', background: 'linear-gradient(90deg, #7D9B76 0%, #4E6B49 50%, #C4714A 100%)', flexShrink: 0 }} />

        {/* Content */}
        <div style={{ flex: 1, padding: '36px 48px 32px' }}>

          {/* ── Header: matches site navbar ──────────────── */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '8px' }}>
            {/* Brand — same as navbar: circular logo + "nutravoe" in display font */}
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
                fontSize: '26px',
                fontWeight: '300',
                letterSpacing: '0.3em',
                color: '#1C1C1A',
                textTransform: 'lowercase',
                lineHeight: 1,
              }}>
                nutravoe
              </span>
            </div>

            {/* Invoice label */}
            <div style={{ textAlign: 'right' }}>
              <p style={{
                fontFamily: 'Georgia, serif',
                fontSize: '34px',
                fontWeight: '300',
                color: '#7D9B76',
                letterSpacing: '-0.02em',
                lineHeight: 1,
              }}>
                INVOICE
              </p>
              <p style={{
                fontFamily: 'sans-serif',
                fontSize: '13px',
                color: '#1C1C1A',
                fontWeight: '700',
                marginTop: '6px',
                letterSpacing: '0.04em',
              }}>
                {invoiceNumber}
              </p>
            </div>
          </div>

          {/* ── Business address — below logo ─────────────── */}
          <p style={{ fontSize: '11px', color: '#BFBBB6', fontFamily: 'sans-serif', lineHeight: '1.7', marginBottom: '32px' }}>
            Domlur Kitchen, Victoria II Apartment · 314/8 Patel Ram Reddy Rd, Domlur, Bengaluru 560071<br />
            nutravoe.in · @nutravoe
          </p>

          {/* ── Meta row ─────────────────────────────────── */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#F9F8F6',
            borderLeft: '3px solid #7D9B76',
            borderRadius: '0 8px 8px 0',
            padding: '12px 16px',
            marginBottom: '28px',
          }}>
            <MetaItem label="Order Date" value={orderDate} />
            <MetaItem label="Delivered On" value={deliveredOn} />
            <MetaItem label="Status" value="PAID" valueColor="#4E6B49" bold />
          </div>

          {/* ── Bill To / Delivery Address ────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', marginBottom: '28px' }}>
            <div>
              <SectionLabel>Bill To</SectionLabel>
              <p style={nameStyle}>{o.users.full_name}</p>
              <p style={detailStyle}>{o.users.email}</p>
              {o.users.phone && <p style={detailStyle}>{o.users.phone}</p>}
            </div>
            {o.addresses && (
              <div>
                <SectionLabel>Delivery Address</SectionLabel>
                <p style={nameStyle}>{o.addresses.line1}</p>
                {o.addresses.line2 && <p style={detailStyle}>{o.addresses.line2}</p>}
                <p style={detailStyle}>
                  {o.addresses.city}{o.addresses.state ? `, ${o.addresses.state}` : ''} — {o.addresses.pincode}
                </p>
              </div>
            )}
          </div>

          {/* ── Divider ──────────────────────────────────── */}
          <div style={{ height: '1px', background: '#E8E5E0', marginBottom: '24px' }} />

          {/* ── Items table ──────────────────────────────── */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px' }}>
            <thead>
              <tr style={{ background: '#1C1C1A' }}>
                <Th align="left" width="38%">Description</Th>
                <Th align="center" width="8%">Qty</Th>
                <Th align="right" width="16%">Unit Price</Th>
                <Th align="right" width="18%">Customisation</Th>
                <Th align="right" width="20%">Amount</Th>
              </tr>
            </thead>
            <tbody>
              {o.order_items.map((item, idx) => {
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
                      {item.customizations?.removed && item.customizations.removed.length > 0 && (
                        <p style={{ fontSize: '11px', color: '#C4714A', marginTop: '2px', fontFamily: 'sans-serif' }}>
                          − {item.customizations.removed.join(', ')}
                        </p>
                      )}
                      {item.customizations?.added && item.customizations.added.length > 0 && (
                        <p style={{ fontSize: '11px', color: '#4E6B49', marginTop: '2px', fontFamily: 'sans-serif' }}>
                          + {item.customizations.added.join(', ')}
                        </p>
                      )}
                    </td>
                    <Td align="center">{item.quantity}</Td>
                    <Td align="right" muted>₹ {Number(item.unit_price).toLocaleString('en-IN')}</Td>
                    <Td align="right" muted>
                      {customCost > 0 ? `₹ ${customCost.toLocaleString('en-IN')}` : '—'}
                    </Td>
                    <Td align="right" bold>₹ {Number(item.total_price).toLocaleString('en-IN')}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* ── Totals ───────────────────────────────────── */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '28px' }}>
            <div style={{ minWidth: '270px' }}>
              {discount > 0 && (
                <>
                  <TotalRow label="Items Total" value={`₹ ${rawItemsTotal.toLocaleString('en-IN')}`} />
                  <TotalRow label="Subscriber Discount" value={`− ₹ ${discount.toLocaleString('en-IN')}`} valueColor="#4E6B49" />
                </>
              )}
              {!discount && (
                <TotalRow label="Subtotal" value={`₹ ${Number(o.subtotal).toLocaleString('en-IN')}`} />
              )}
              <TotalRow
                label="Delivery"
                value={Number(o.delivery_fee) === 0 ? 'Free' : `₹ ${Number(o.delivery_fee).toLocaleString('en-IN')}`}
                valueColor={Number(o.delivery_fee) === 0 ? '#4E6B49' : undefined}
              />
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 14px', background: '#1C1C1A', borderRadius: '8px', marginTop: '8px',
              }}>
                <span style={{ fontSize: '12px', fontWeight: '700', color: 'white', letterSpacing: '0.08em', fontFamily: 'sans-serif' }}>
                  TOTAL PAID
                </span>
                <span style={{ fontSize: '20px', fontWeight: '400', color: 'white', fontFamily: 'Georgia, serif' }}>
                  ₹ {Number(o.total).toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          </div>

          {/* ── Payment info ─────────────────────────────── */}
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
                {paymentLabel[o.payment_method ?? ''] ?? o.payment_method ?? '—'}
              </p>
            </div>
            {o.payment_reference && (
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: '10px', color: '#7D9B76', fontWeight: '700', letterSpacing: '0.1em', fontFamily: 'sans-serif', textTransform: 'uppercase', marginBottom: '3px' }}>
                  Reference
                </p>
                <p style={{ fontSize: '13px', color: '#1C1C1A', fontFamily: 'sans-serif', fontWeight: '500' }}>
                  {o.payment_reference}
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
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              PAID
            </div>
          </div>

          {/* ── Divider ──────────────────────────────────── */}
          <div style={{ height: '1px', background: '#E8E5E0', marginBottom: '24px' }} />

          {/* ── Footer ───────────────────────────────────── */}
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

        {/* Bottom accent bar — flush to edge */}
        <div style={{ height: '6px', background: 'linear-gradient(90deg, #C4714A 0%, #7D9B76 100%)', flexShrink: 0 }} />
      </div>
    </>
  );
}

/* ── Sub-components ─────────────────────────────────────── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: '10px', fontWeight: '700', color: '#7D9B76',
      letterSpacing: '0.14em', textTransform: 'uppercase',
      fontFamily: 'sans-serif', marginBottom: '8px',
    }}>
      {children}
    </p>
  );
}

function MetaItem({ label, value, valueColor, bold }: {
  label: string; value: string; valueColor?: string; bold?: boolean;
}) {
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

function Th({ children, align, width }: {
  children: React.ReactNode; align: 'left' | 'center' | 'right'; width?: string;
}) {
  return (
    <th style={{
      padding: '10px 14px', textAlign: align, width,
      fontSize: '10px', fontWeight: '700', color: 'white',
      letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'sans-serif',
    }}>
      {children}
    </th>
  );
}

function Td({ children, align, muted, bold }: {
  children: React.ReactNode; align: 'left' | 'center' | 'right'; muted?: boolean; bold?: boolean;
}) {
  return (
    <td style={{
      padding: '11px 14px', textAlign: align,
      fontSize: '13px', fontFamily: 'sans-serif',
      color: muted ? '#9A9590' : '#1C1C1A',
      fontWeight: bold ? '600' : '400',
    }}>
      {children}
    </td>
  );
}

function TotalRow({ label, value, valueColor }: {
  label: string; value: string; valueColor?: string;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 14px' }}>
      <span style={{ fontSize: '12px', color: '#9A9590', fontFamily: 'sans-serif' }}>{label}</span>
      <span style={{ fontSize: '13px', color: valueColor ?? '#1C1C1A', fontFamily: 'sans-serif', fontWeight: '500' }}>
        {value}
      </span>
    </div>
  );
}

const nameStyle: React.CSSProperties = {
  fontSize: '14px', fontWeight: '600', color: '#1C1C1A', fontFamily: 'sans-serif', marginBottom: '4px',
};
const detailStyle: React.CSSProperties = {
  fontSize: '12px', color: '#9A9590', fontFamily: 'sans-serif', lineHeight: '1.65',
};
