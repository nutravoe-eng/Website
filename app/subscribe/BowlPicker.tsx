'use client';

import Image from "next/image";
import type { Bowl } from "@/types";

interface Props {
  bowls: Bowl[];
  selectedBowlId: string;
  onSelect: (bowlId: string) => void;
  label?: string;
}

export default function BowlPicker({ bowls, selectedBowlId, onSelect, label }: Props) {
  return (
    <div>
      {label && (
        <p className="font-body text-[11px] font-bold uppercase tracking-wider text-stone mb-2">
          {label}
        </p>
      )}
      <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {bowls.map(bowl => (
          <button
            key={bowl._id}
            onClick={() => onSelect(bowl._id)}
            className={`flex-shrink-0 flex flex-col items-center gap-2 p-2.5 rounded-xl border-2 transition-all w-[88px] ${
              selectedBowlId === bowl._id
                ? 'border-sage bg-sage/10'
                : 'border-black/10 bg-white hover:border-sage/40'
            }`}
          >
            <div className="w-12 h-12 rounded-lg overflow-hidden bg-[#F9F8F6] relative shrink-0">
              <Image
                src={bowl.image}
                alt={bowl.name}
                fill
                className="object-contain"
                sizes="48px"
              />
            </div>
            <p className="font-body text-[10px] text-center text-ink leading-tight line-clamp-2 w-full">
              {bowl.name}
            </p>
            {selectedBowlId === bowl._id && (
              <div className="w-4 h-4 rounded-full bg-sage flex items-center justify-center shrink-0">
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
