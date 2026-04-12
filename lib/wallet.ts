import { createClient } from '@/lib/supabase/client';
import type { Wallet, WalletLoad, WalletTransaction } from '@/types';

interface WalletLotRow {
  id: string;
  amount_rs: number;
  remaining_amount_rs: number;
  expires_at: string | null;
  created_at: string;
  source_type: WalletLoad['sourceType'];
}

interface WalletTransactionRow {
  id: string;
  type: 'credit' | 'debit';
  amount_rs: number;
  reason: string;
  note: string | null;
  created_at: string;
}

function isActiveLot(row: WalletLotRow) {
  return row.remaining_amount_rs > 0 && (!row.expires_at || new Date(row.expires_at).getTime() > Date.now());
}

function mapLoads(rows: WalletLotRow[]): WalletLoad[] {
  return rows
    .filter(isActiveLot)
    .sort((a, b) => {
      const aTime = a.expires_at ? new Date(a.expires_at).getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.expires_at ? new Date(b.expires_at).getTime() : Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    })
    .map((row) => ({
      id: row.id,
      amountPaise: Number(row.amount_rs) * 100,
      remainingAmountPaise: Number(row.remaining_amount_rs) * 100,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      sourceType: row.source_type,
    }));
}

function mapTransactions(rows: WalletTransactionRow[]): WalletTransaction[] {
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    amountPaise: Number(row.amount_rs) * 100,
    description: row.note?.trim() || row.reason.replace(/_/g, ' '),
    createdAt: row.created_at,
  }));
}

async function getWalletState(): Promise<Wallet> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { balancePaise: 0, transactions: [], activeLoads: [], nextExpiryAt: null };
  }

  const [{ data: lotRows }, { data: txRows }] = await Promise.all([
    supabase
      .from('wallet_credit_lots')
      .select('id, amount_rs, remaining_amount_rs, expires_at, created_at, source_type')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('wallet_transactions')
      .select('id, type, amount_rs, reason, note, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
  ]);

  const typedLots = (lotRows ?? []) as WalletLotRow[];
  const activeLoads = mapLoads(typedLots);
  const balancePaise = activeLoads.reduce((sum, load) => sum + load.remainingAmountPaise, 0);
  const nextExpiryAt = activeLoads.find((load) => load.expiresAt)?.expiresAt ?? null;

  return {
    balancePaise,
    transactions: mapTransactions((txRows ?? []) as WalletTransactionRow[]),
    activeLoads,
    nextExpiryAt,
  };
}

export async function getWallet(): Promise<Wallet> {
  return getWalletState();
}

export async function hasActiveFlexibleSubscription(): Promise<boolean> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return false;

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('user_id', user.id)
    .eq('style', 'flexible')
    .neq('status', 'cancelled')
    .limit(1)
    .maybeSingle();

  return sub !== null;
}

export async function getWalletWithTransactions(): Promise<Wallet> {
  return getWalletState();
}
