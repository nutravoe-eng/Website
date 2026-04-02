import { STUB_SETTINGS } from '@/lib/sanity';

export function getWhatsAppNumber() {
  return process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || STUB_SETTINGS.whatsappNumber;
}

export function getWhatsAppHref(message?: string) {
  const number = getWhatsAppNumber();
  return message
    ? `https://wa.me/${number}?text=${encodeURIComponent(message)}`
    : `https://wa.me/${number}`;
}
