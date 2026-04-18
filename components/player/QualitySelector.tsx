"use client";

import { useState, useRef, useEffect } from 'react';
import type { QualityLevel } from '@/lib/video/hlsPlayer';

interface QualitySelectorProps {
  levels: QualityLevel[];
  currentIndex: number;
  onSelect: (index: number) => void;
}

export default function QualitySelector({ levels, currentIndex, onSelect }: QualitySelectorProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  const currentLabel = currentIndex === -1
    ? 'Auto'
    : levels.find(l => l.index === currentIndex)?.label ?? 'Auto';

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="px-2 py-1 text-xs font-medium text-white bg-white/15 backdrop-blur-sm rounded hover:bg-white/25 transition-colors"
      >
        {currentLabel}
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 min-w-[120px] bg-surface/90 backdrop-blur-sm rounded shadow-lg overflow-hidden">
          <button
            onClick={() => { onSelect(-1); setOpen(false); }}
            className={`w-full text-left px-3 py-1.5 text-xs hover:bg-white/10 transition-colors ${
              currentIndex === -1 ? 'text-purple-400 font-semibold' : 'text-white'
            }`}
          >
            Auto
          </button>
          {levels.map(level => (
            <button
              key={level.index}
              onClick={() => { onSelect(level.index); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-white/10 transition-colors ${
                currentIndex === level.index ? 'text-purple-400 font-semibold' : 'text-white'
              }`}
            >
              {level.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
