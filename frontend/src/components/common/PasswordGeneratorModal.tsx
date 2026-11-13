import React, { useState, useEffect } from 'react';
import { X, RefreshCw, Copy, Check, ShieldCheck, Sliders, Sparkles } from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { api } from '../../lib/api';

export const PasswordGeneratorModal: React.FC = () => {
  const { isPasswordGenOpen, closePasswordGen, copyToClipboard } = useVault();

  const [mode, setMode] = useState<'random' | 'passphrase'>('random');
  const [length, setLength] = useState(20);
  const [includeUpper, setIncludeUpper] = useState(true);
  const [includeLower, setIncludeLower] = useState(true);
  const [includeDigits, setIncludeDigits] = useState(true);
  const [includeSymbols, setIncludeSymbols] = useState(true);
  const [avoidAmbiguous, setAvoidAmbiguous] = useState(true);

  const [generatedPassword, setGeneratedPassword] = useState('');
  const [entropy, setEntropy] = useState<{ bits: number; score: number; label: string; color: string }>({
    bits: 0,
    score: 0,
    label: 'Vacía',
    color: '#858d98'
  });
  const [copied, setCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const generate = async () => {
    setIsGenerating(true);
    try {
      const res = await api.generatePassword({
        length,
        include_uppercase: includeUpper,
        include_lowercase: includeLower,
        include_digits: includeDigits,
        include_symbols: includeSymbols,
        avoid_ambiguous: avoidAmbiguous,
        mode
      });
      setGeneratedPassword(res.password);
      setEntropy(res.entropy);
    } catch (err) {
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    if (isPasswordGenOpen) {
      generate();
    }
  }, [isPasswordGenOpen, mode, length, includeUpper, includeLower, includeDigits, includeSymbols, avoidAmbiguous]);

  if (!isPasswordGenOpen) return null;

  const handleCopy = async () => {
    if (!generatedPassword) return;
    await copyToClipboard(generatedPassword, 'Contraseña generada');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="responsive-overlay fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/75 backdrop-blur-md animate-fadeIn">
      <div 
        role="dialog"
        aria-modal="true"
        aria-labelledby="password-gen-title"
        className="relative w-full max-w-lg bg-obsidian-panel border border-obsidian-borderLight rounded-xl sm:rounded-2xl shadow-2xl p-4 sm:p-6 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-1 bg-gradient-to-r from-transparent via-cyan-500 to-transparent" />

        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Sparkles size={20} />
            </div>
            <div>
              <h2 id="password-gen-title" className="text-base font-semibold text-white tracking-tight">
                Generador de Contraseñas & Passphrases
              </h2>
              <p className="text-xs text-obsidian-muted">
                Crea una contraseña difícil de adivinar
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closePasswordGen}
            className="p-1.5 text-obsidian-muted hover:text-white rounded-lg hover:bg-obsidian-surface transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Display Box */}
        <div className="mb-5 p-4 rounded-xl bg-obsidian-bg border border-obsidian-border flex items-center justify-between gap-3 group">
          <span className="font-mono text-sm text-cyan-200 tracking-wider break-all select-all font-medium">
            {generatedPassword || 'Generando...'}
          </span>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={generate}
              title="Regenerar"
              className="p-2 text-obsidian-muted hover:text-white rounded-lg hover:bg-obsidian-surface border border-transparent hover:border-obsidian-border transition-all"
            >
              <RefreshCw size={15} className={isGenerating ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                copied
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20'
              }`}
            >
              {copied ? (
                <>
                  <Check size={14} />
                  <span>Copiado</span>
                </>
              ) : (
                <>
                  <Copy size={14} />
                  <span>Copiar</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Entropy Meter */}
        <div className="mb-6 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-obsidian-muted flex items-center gap-1.5">
              <ShieldCheck size={14} style={{ color: entropy.color }} />
              Fuerza: <strong style={{ color: entropy.color }}>{entropy.label}</strong>
            </span>
            <span className="text-obsidian-muted">Nivel de seguridad</span>
          </div>
          <div className="w-full h-2 rounded-full bg-obsidian-surface overflow-hidden border border-obsidian-border">
            <div
              className="h-full transition-all duration-300 rounded-full"
              style={{
                width: `${Math.max(5, entropy.score)}%`,
                backgroundColor: entropy.color
              }}
            />
          </div>
        </div>

        {/* Mode Selector */}
        <div className="flex p-1 mb-4 rounded-xl bg-obsidian-bg border border-obsidian-border">
          <button
            type="button"
            onClick={() => setMode('random')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${
              mode === 'random' ? 'bg-obsidian-surface text-white shadow-sm' : 'text-obsidian-muted hover:text-white'
            }`}
          >
            Caracteres Aleatorios
          </button>
          <button
            type="button"
            onClick={() => setMode('passphrase')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${
              mode === 'passphrase' ? 'bg-obsidian-surface text-white shadow-sm' : 'text-obsidian-muted hover:text-white'
            }`}
          >
            Passphrase (Memorable)
          </button>
        </div>

        {/* Controls */}
        <div className="space-y-4">
          <div>
            <div className="flex justify-between items-center text-xs text-obsidian-muted mb-1.5">
              <span>{mode === 'random' ? 'Longitud de caracteres' : 'Palabras clave'}</span>
              <span className="font-mono text-white font-semibold">{length}</span>
            </div>
            <input
              type="range"
              min={mode === 'random' ? 12 : 16}
              max={mode === 'random' ? 48 : 32}
              value={length}
              onChange={(e) => setLength(Number(e.target.value))}
              className="w-full h-1.5 bg-obsidian-surface rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5 pt-1 text-xs">
            <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-obsidian-surface/60 transition-colors">
              <input
                type="checkbox"
                checked={includeUpper}
                onChange={(e) => setIncludeUpper(e.target.checked)}
                className="rounded border-obsidian-border bg-obsidian-bg text-indigo-600 focus:ring-0"
              />
              <span className="text-obsidian-text">Mayúsculas (A-Z)</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-obsidian-surface/60 transition-colors">
              <input
                type="checkbox"
                checked={includeLower}
                onChange={(e) => setIncludeLower(e.target.checked)}
                className="rounded border-obsidian-border bg-obsidian-bg text-indigo-600 focus:ring-0"
              />
              <span className="text-obsidian-text">Minúsculas (a-z)</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-obsidian-surface/60 transition-colors">
              <input
                type="checkbox"
                checked={includeDigits}
                onChange={(e) => setIncludeDigits(e.target.checked)}
                className="rounded border-obsidian-border bg-obsidian-bg text-indigo-600 focus:ring-0"
              />
              <span className="text-obsidian-text">Números (0-9)</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-obsidian-surface/60 transition-colors">
              <input
                type="checkbox"
                checked={includeSymbols}
                onChange={(e) => setIncludeSymbols(e.target.checked)}
                className="rounded border-obsidian-border bg-obsidian-bg text-indigo-600 focus:ring-0"
              />
              <span className="text-obsidian-text">Símbolos (!@#$)</span>
            </label>

            <label className="col-span-2 flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-obsidian-surface/60 transition-colors">
              <input
                type="checkbox"
                checked={avoidAmbiguous}
                onChange={(e) => setAvoidAmbiguous(e.target.checked)}
                className="rounded border-obsidian-border bg-obsidian-bg text-indigo-600 focus:ring-0"
              />
              <span className="text-obsidian-text">Evitar caracteres ambiguos (0, O, I, l, 1)</span>
            </label>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={closePasswordGen}
            className="px-4 py-2 text-xs font-semibold text-obsidian-text bg-obsidian-surface hover:bg-obsidian-border border border-obsidian-border rounded-xl transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
