import React, { useState, useRef, useEffect } from 'react';
import { Info } from 'lucide-react';

interface InfoTooltipProps {
  text?: string;
  content?: string;
  title?: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

export const InfoTooltip: React.FC<InfoTooltipProps> = ({
  text,
  content,
  title,
  position = 'top',
  className = '',
}) => {
  const displayContent = text || content || '';
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  }[position];

  return (
    <span
      ref={containerRef}
      className={`relative inline-flex items-center shrink-0 align-middle ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        aria-label={title || 'Información contextual'}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 border border-transparent hover:border-indigo-500/30 transition-colors focus:outline-none"
      >
        <Info className="w-3.5 h-3.5" />
      </button>

      {open && (
        <span
          role="tooltip"
          onClick={(e) => e.stopPropagation()}
          className={`responsive-tooltip pointer-events-auto absolute z-50 w-64 sm:w-72 p-2.5 rounded-lg bg-[#0d0f14]/95 backdrop-blur-md border border-slate-700/80 shadow-2xl text-left font-normal normal-case tracking-normal animate-fade-in ${positionClasses}`}
        >
          {title && (
            <span className="block text-[11px] font-semibold text-indigo-300 mb-1 leading-tight">
              {title}
            </span>
          )}
          <span className="block text-[11px] text-slate-300 leading-relaxed">
            {displayContent}
          </span>
        </span>
      )}
    </span>
  );
};
