import React, { useId, useState, useRef, useEffect } from 'react';
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
  const tooltipId = useId();
  const containerRef = useRef<HTMLSpanElement>(null);
  const hoveredRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', handleOutside);
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', handleOutside);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
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
      onMouseEnter={() => {
        hoveredRef.current = true;
        setOpen(true);
      }}
      onMouseLeave={() => {
        hoveredRef.current = false;
        if (!containerRef.current?.contains(document.activeElement)) setOpen(false);
      }}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          if (!hoveredRef.current) setOpen(false);
        }}
        aria-label={title || 'Más información'}
        aria-expanded={open}
        aria-controls={tooltipId}
        aria-describedby={open ? tooltipId : undefined}
        className="inline-flex items-center justify-center min-w-6 min-h-6 rounded-full text-slate-400 hover:text-indigo-300 hover:bg-indigo-500/10 border border-transparent hover:border-indigo-500/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
      >
        <Info className="w-3.5 h-3.5" aria-hidden="true" />
      </button>

      {open && (
        <span
          id={tooltipId}
          role="tooltip"
          onClick={(e) => e.stopPropagation()}
          className={`responsive-tooltip pointer-events-auto absolute z-50 w-64 max-w-[calc(100vw-1rem)] sm:w-72 p-2.5 rounded-lg bg-[#0d0f14]/95 border border-slate-700/80 shadow-xl text-left font-normal normal-case tracking-normal animate-fade-in ${positionClasses}`}
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
