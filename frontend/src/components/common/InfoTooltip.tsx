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
      {/* [Icono] Abre la ayuda contextual. */}
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
        className="ui-action-icon"
      >
        <Info size={16} aria-hidden="true" />
      </button>

      {open && (
        <span
          id={tooltipId}
          role="tooltip"
          onClick={(e) => e.stopPropagation()}
          className={`responsive-tooltip pointer-events-auto absolute z-50 w-64 max-w-[calc(100vw-1rem)] rounded-lg border border-obsidian-border bg-obsidian-panel p-3 text-left font-normal normal-case tracking-normal shadow-lg animate-fade-in sm:w-72 ${positionClasses}`}
        >
          {title && (
            <span className="mb-2 block text-[11px] font-semibold leading-tight text-obsidian-text">
              {title}
            </span>
          )}
          <span className="block text-[11px] leading-relaxed text-obsidian-muted">
            {displayContent}
          </span>
        </span>
      )}
    </span>
  );
};
