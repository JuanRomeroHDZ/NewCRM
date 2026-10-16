import React, { useState, useEffect } from 'react';
import { Copy, Check, ShieldCheck, RefreshCw } from 'lucide-react';

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

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!code || code === '------') return;
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
      : 'text-indigo-400 stroke-indigo-400';

  if (compact) {
    return (
      <div 
        onClick={handleCopy}
        title="Copiar código 2FA"
        className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-obsidian-surface border border-obsidian-border hover:border-indigo-500/50 cursor-pointer transition-all group font-mono text-xs"
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
          <Check className="w-3 h-3 text-emerald-400" />
        ) : (
          <Copy className="w-3 h-3 text-white/30 group-hover:text-white" />
        )}
      </div>
    );
  }

  return (
    <div 
      onClick={handleCopy}
      className="p-3 rounded-xl bg-obsidian-surface/80 border border-obsidian-border hover:border-indigo-500/40 transition-all cursor-pointer group flex items-center justify-between"
    >
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
          <ShieldCheck className="w-4 h-4" />
        </div>
        <div>
          <div className="text-[10px] uppercase font-bold tracking-wider text-white/40">
            Código 2FA (TOTP)
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
          <span className={`absolute text-[9px] font-mono font-bold ${colorClass.split(' ')[0]}`}>
            {seconds}
          </span>
        </div>

        <button 
          type="button"
          onClick={handleCopy}
          className="p-2 rounded-lg bg-white/5 group-hover:bg-indigo-500/20 text-white/50 group-hover:text-indigo-300 transition-all"
        >
          {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
};
