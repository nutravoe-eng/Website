import { createClient } from '@/lib/supabase/client';
import type { Wallet, WalletTransaction } from '@/types';

export async function getWallet(): Promise<Wallet> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { balancePaise: 0, transactions: [] };

  const { data: account } = await supabase
    .from('wallet_accounts')
    .select('balance_rs')
    .eq('user_id', user.id)
    .maybeSingle();

  return {
    balancePaise: account ? account.balance_rs * 100 : 0,
    transactions: [],
  };
}

export async function creditWallet(amountPaise: number, description: string): Promise<Wallet> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { balancePaise: 0, transactions: [] };

  // Get or create wallet account
  const { data: existing } = await supabase
    .from('wallet_accounts')
    .select('id, balance_rs')
    .eq('user_id', user.id)
    .maybeSingle();

  const currentRs = existing?.balance_rs ?? 0;
  const newBalanceRs = currentRs + amountPaise / 100;

  const { data: upserted, error: upsertError } = await supabase
    .from('wallet_accounts')
    .upsert(
      { user_id: user.id, balance_rs: newBalanceRs },
      { onConflict: 'user_id' }
    )
    .select('id, balance_rs')
    .single();

  if (upsertError || !upserted) {
    return { balancePaise: currentRs * 100, transactions: [] };
  }

  await supabase.from('wallet_transactions').insert({
    wallet_id: upserted.id,
    user_id: user.id,
    type: 'credit',
    reason: description,
    amount_rs: amountPaise / 100,
    balance_after: newBalanceRs,
  });

  return { balancePaise: upserted.balance_rs * 100, transactions: [] };
}

// Returns updated wallet, or null if balance is insufficient
export async function debitWallet(amountPaise: number, description: string): Promise<Wallet | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: account } = await supabase
    .from('wallet_accounts')
    .select('id, balance_rs')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!account || account.balance_rs * 100 < amountPaise) return null;

  const newBalanceRs = account.balance_rs - amountPaise / 100;

  const { error: updateError } = await supabase
    .from('wallet_accounts')
    .update({ balance_rs: newBalanceRs })
    .eq('user_id', user.id);

  if (updateError) return null;

  await supabase.from('wallet_transactions').insert({
    wallet_id: account.id,
    user_id: user.id,
    type: 'debit',
    reason: description,
    amount_rs: amountPaise / 100,
    balance_after: newBalanceRs,
  });

  return { balancePaise: newBalanceRs * 100, transactions: [] };
}

export async function hasActiveFlexibleSubscription(): Promise<boolean> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('user_id', user.id)
    .eq('style', 'flexible')
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  return data !== null;
}

// Convenience: fetch full wallet with transactions for the wallet page
export async function getWalletWithTransactions(): Promise<{
  balancePaise: number;
  transactions: WalletTransaction[];
}> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { balancePaise: 0, transactions: [] };

  const { data: account } = await supabase
    .from('wallet_accounts')
    .select('id, balance_rs')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!account) return { balancePaise: 0, transactions: [] };

  const { data: txRows } = await supabase
    .from('wallet_transactions')
    .select('id, type, amount_rs, reason, created_at')
    .eq('wallet_id', account.id)
    .order('created_at', { ascending: false });

  const transactions: WalletTransaction[] = (txRows ?? []).map(row => ({
    id: row.id,
    type: row.type as 'credit' | 'debit',
    amountPaise: row.amount_rs * 100,
    description: row.reason ?? '',
    createdAt: row.created_at,
  }));

  return { balancePaise: account.balance_rs * 100, transactions };
}
