'use client';

import { useEffect, useRef } from 'react';

/** Fired by the new-order alert when new orders arrive and when they're accepted. */
export const ADMIN_ORDERS_CHANGED = 'nv-admin-orders-changed';

export function announceOrdersChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(ADMIN_ORDERS_CHANGED));
}

/** Re-runs `reload` whenever the new-order alert reports new or accepted orders. */
export function useReloadOnOrdersChanged(reload: () => void) {
  const ref = useRef(reload);
  ref.current = reload;
  useEffect(() => {
    const handler = () => ref.current();
    window.addEventListener(ADMIN_ORDERS_CHANGED, handler);
    return () => window.removeEventListener(ADMIN_ORDERS_CHANGED, handler);
  }, []);
}
