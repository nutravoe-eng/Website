'use client';

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="bg-white text-ink font-body text-sm font-bold px-5 py-2 rounded-lg hover:bg-white/90 transition-colors"
    >
      Save as PDF / Print
    </button>
  );
}
