import React, { useState, useEffect } from 'react';
import { Copy, Check, ShieldCheck } from 'lucide-react';

interface TotpWidgetProps {
  initialCode?: string;
  initialRemaining?: number;
  onRefresh?: () => Promise<{ code: string; remaining_seconds: number } | null>;
  compact?: boolean;
}

export const TotpWidget: React.FC<TotpWidgetProps> = ({
  initialCode = '------',
  initialRemaining = 30,
  onRefresh,
  compact = false
}) => {
  const [code, setCode] = useState<string>(initialCode);
  const [seconds, setSeconds] = useState<number>(initialRemaining);
  const [copied, setCopied] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  useEffect(() => {
    setCode(initialCode);
  }, [initialCode]);

  useEffect(() => {
    setSeconds(initialRemaining);
  }, [initialRemaining]);

  useEffect(() => {
    const timer = setInterval(() => {
      setSeconds((prev) => {
        if (prev <= 1) {
          if (onRefresh) {
            handleAutoRefresh();
          }
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [onRefresh]);

  const handleAutoRefresh = async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    try {
      const res = await onRefresh();
      if (res) {
        setCode(res.code);
        setSeconds(res.remaining_seconds);
      }
    } catch (_) {
      // ignore
    } finally {
      setRefreshing(false);
    }
  };

  const copyCode = () => {
    if (!code || code === '------') return;
    void navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    copyCode();
  };

  const formattedCode = code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
  const progressPercent = Math.max(0, Math.min(100, (seconds / 30) * 100));
  const circleRadius = 12;
  const circumference = 2 * Math.PI * circleRadius;
  const strokeOffset = circumference - (progressPercent / 100) * circumference;

  const colorClass =
    seconds <= 5
      ? 'text-rose-500 stroke-rose-500'
      : seconds <= 10
      ? 'text-amber-400 stroke-amber-400'
      : 'text-obsidian-muted stroke-obsidian-muted';

  if (compact) {
    return (
      /* [Acción secundaria] Copiar el código mientras esté disponible. */
      <button
        type="button"
        onClick={handleCopy}
        title="Copiar código de verificación"
        aria-label="Copiar código de verificación"
        disabled={!code || code === '------'}
        className="ui-action-secondary group font-mono"
      >
        <span className="text-white font-bold tracking-wider">{formattedCode}</span>
        
        {/* Mini progress circle */}
        <div className="relative w-4 h-4 flex items-center justify-center">
          <svg className="w-4 h-4 transform -rotate-90">
            <circle
              cx="8"
              cy="8"
              r="6"
              className="stroke-white/10"
              strokeWidth="2"
              fill="transparent"
            />
            <circle
              cx="8"
              cy="8"
              r="6"
              className={colorClass}
              strokeWidth="2"
              strokeDasharray={2 * Math.PI * 6}
              strokeDashoffset={(2 * Math.PI * 6) - (progressPercent / 100) * (2 * Math.PI * 6)}
              strokeLinecap="round"
              fill="transparent"
              style={{ transition: 'stroke-dashoffset 1s linear' }}
            />
          </svg>
        </div>

        {copied ? (
          <Check size={16} className="text-emerald-400" aria-hidden="true" />
        ) : (
          <Copy size={16} className="text-obsidian-muted group-hover:text-white" aria-hidden="true" />
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={!code || code === '------'}
      aria-label="Copiar código de verificación"
      className="ui-nav-action w-full justify-between"
    >
      <div className="flex items-center gap-3">
        <ShieldCheck size={18} className="shrink-0 text-obsidian-muted" aria-hidden="true" />
        <div>
          <div className="text-xs font-medium text-obsidian-muted">
            Código de verificación
          </div>
          <div className="font-mono text-lg font-bold text-white tracking-widest flex items-center gap-2">
            <span>{formattedCode}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Countdown gauge */}
        <div className="relative w-7 h-7 flex items-center justify-center">
          <svg className="w-7 h-7 transform -rotate-90">
            <circle
              cx="14"
              cy="14"
              r={circleRadius}
              className="stroke-white/10"
              strokeWidth="2.5"
              fill="transparent"
            />
            <circle
              cx="14"
              cy="14"
              r={circleRadius}
              className={colorClass}
              strokeWidth="2.5"
              strokeDasharray={circumference}
              strokeDashoffset={strokeOffset}
              strokeLinecap="round"
              fill="transparent"
              style={{ transition: 'stroke-dashoffset 1s linear' }}
            />
          </svg>
          <span className={`absolute text-[10px] font-mono font-bold ${colorClass.split(' ')[0]}`}>
            {seconds}
          </span>
        </div>

        <span className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-obsidian-muted" aria-hidden="true">
          {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
        </span>
      </div>
    </button>
  );
};
