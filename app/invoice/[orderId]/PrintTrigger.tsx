'use client';

import { useEffect } from 'react';

export default function PrintTrigger() {
  useEffect(() => {
    // Small delay so fonts and images finish loading
    const t = setTimeout(() => window.print(), 800);
    return () => clearTimeout(t);
  }, []);
  return null;
}
