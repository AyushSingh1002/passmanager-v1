import React, { useEffect, useState } from 'react';
import { Check, Copy, Plus, RefreshCw } from 'lucide-react';
import { t } from '../core/i18n';
import { generatePassphrase, generateRandomPassword } from '../core/password';
import type { LanguageCode } from '../types/vault';
import { CountdownRing } from './ui/CountdownRing';
import { StrengthMeter } from './ui/StrengthMeter';

interface GeneratorViewProps {
  language: LanguageCode;
  onCopySecret: (label: string, value: string) => void;
  onSaveToVault: (password: string) => void;
  activeCopyLabel: string | null;
  copyRemainingSeconds: number;
  copyTotalSeconds: number;
}

export const GeneratorView: React.FC<GeneratorViewProps> = ({
  language,
  onCopySecret,
  onSaveToVault,
  activeCopyLabel,
  copyRemainingSeconds,
  copyTotalSeconds,
}) => {
  const [mode, setMode] = useState<'random' | 'passphrase'>('random');
  const [length, setLength] = useState(20);
  const [uppercase, setUppercase] = useState(true);
  const [lowercase, setLowercase] = useState(true);
  const [digits, setDigits] = useState(true);
  const [symbols, setSymbols] = useState(true);
  const [excludeLookalikes, setExcludeLookalikes] = useState(true);

  const [wordCount, setWordCount] = useState(5);
  const [separator, setSeparator] = useState<'-' | '.' | ' ' | '_'>('-');
  const [capitalize, setCapitalize] = useState(true);
  const [includeNumber, setIncludeNumber] = useState(true);

  const [value, setValue] = useState('');

  const regenerate = () => {
    if (mode === 'random') {
      setValue(
        generateRandomPassword({
          length,
          uppercase,
          lowercase,
          digits,
          symbols,
          excludeLookalikes,
        })
      );
    } else {
      setValue(
        generatePassphrase({
          wordCount,
          separator,
          capitalize,
          includeNumber,
        })
      );
    }
  };

  useEffect(() => {
    regenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, length, uppercase, lowercase, digits, symbols, excludeLookalikes, wordCount, separator, capitalize, includeNumber]);

  const isCopied = activeCopyLabel === 'Generated password';

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-vl-rise">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{t(language, 'generator')}</h1>
        <p className="text-xs text-[var(--vl-text-secondary)] mt-0.5">
          Generated locally using hardware CSPRNG (`crypto.getRandomValues`) and bundled EFF-style wordlist.
        </p>
      </div>

      {/* Mode Switch */}
      <div className="inline-flex p-1 rounded-xl bg-[var(--vl-surface-muted)]">
        <button
          type="button"
          onClick={() => setMode('random')}
          className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
            mode === 'random'
              ? 'bg-[var(--vl-surface)] text-[var(--vl-text-primary)] shadow-sm'
              : 'text-[var(--vl-text-secondary)]'
          }`}
        >
          Random characters
        </button>
        <button
          type="button"
          onClick={() => setMode('passphrase')}
          className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
            mode === 'passphrase'
              ? 'bg-[var(--vl-surface)] text-[var(--vl-text-primary)] shadow-sm'
              : 'text-[var(--vl-text-secondary)]'
          }`}
        >
          Passphrase
        </button>
      </div>

      {/* Generated Result Card */}
      <div className="rounded-2xl bg-[var(--vl-surface)] border border-[var(--vl-border)] p-5 sm:p-6 space-y-4">
        <div
          data-testid="generated-output"
          className="p-4 rounded-xl bg-[var(--vl-bg)] border border-[var(--vl-border)] font-mono-secret text-lg sm:text-xl leading-relaxed break-all select-all"
        >
          {value}
        </div>

        <StrengthMeter password={value} />

        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          <button
            type="button"
            onClick={regenerate}
            className="h-11 px-4 rounded-xl border border-[var(--vl-border)] hover:bg-[var(--vl-surface-muted)] text-sm font-medium inline-flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Regenerate</span>
          </button>

          <button
            type="button"
            onClick={() => onCopySecret('Generated password', value)}
            className="h-11 px-5 rounded-xl bg-[var(--vl-accent)] hover:bg-[var(--vl-accent-hover)] text-white text-sm font-medium inline-flex items-center gap-2 transition-colors"
          >
            {isCopied ? (
              <>
                <Check className="w-4 h-4" />
                <span>{t(language, 'copied')}</span>
                {copyTotalSeconds > 0 && (
                  <CountdownRing
                    remainingSeconds={copyRemainingSeconds}
                    totalSeconds={copyTotalSeconds}
                    size={16}
                    strokeWidth={2}
                  />
                )}
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>{t(language, 'copy')}</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => onSaveToVault(value)}
            className="h-11 px-4 rounded-xl bg-[var(--vl-surface-muted)] hover:opacity-90 text-sm font-medium inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Save to vault</span>
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="rounded-2xl bg-[var(--vl-surface)] border border-[var(--vl-border)] p-5 sm:p-6 space-y-5">
        {mode === 'random' ? (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <label htmlFor="gen-len" className="font-medium">
                  Length
                </label>
                <span className="font-mono-secret tabular-nums font-semibold">{length} chars</span>
              </div>
              <input
                id="gen-len"
                type="range"
                min={8}
                max={64}
                value={length}
                onChange={(e) => setLength(Number(e.target.value))}
                className="w-full accent-[var(--vl-accent)]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { label: 'Uppercase (A–Z)', checked: uppercase, set: setUppercase },
                { label: 'Lowercase (a–z)', checked: lowercase, set: setLowercase },
                { label: 'Digits (0–9)', checked: digits, set: setDigits },
                { label: 'Symbols (!@#$%)', checked: symbols, set: setSymbols },
                { label: 'Exclude look-alikes (0, O, 1, l, I)', checked: excludeLookalikes, set: setExcludeLookalikes },
              ].map((opt) => (
                <label
                  key={opt.label}
                  className="flex items-center justify-between p-3 rounded-xl bg-[var(--vl-bg)] border border-[var(--vl-border)] cursor-pointer"
                >
                  <span className="text-xs font-medium">{opt.label}</span>
                  <input
                    type="checkbox"
                    checked={opt.checked}
                    onChange={(e) => opt.set(e.target.checked)}
                    className="w-4 h-4 accent-[var(--vl-accent)]"
                  />
                </label>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <label htmlFor="gen-words" className="font-medium">
                  Word count
                </label>
                <span className="font-mono-secret tabular-nums font-semibold">{wordCount} words</span>
              </div>
              <input
                id="gen-words"
                type="range"
                min={4}
                max={8}
                value={wordCount}
                onChange={(e) => setWordCount(Number(e.target.value))}
                className="w-full accent-[var(--vl-accent)]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex items-center justify-between p-3 rounded-xl bg-[var(--vl-bg)] border border-[var(--vl-border)]">
                <span className="text-xs font-medium">Separator</span>
                <select
                  value={separator}
                  onChange={(e) => setSeparator(e.target.value as '-' | '.' | ' ' | '_')}
                  className="h-8 px-2 rounded-lg bg-[var(--vl-surface)] border border-[var(--vl-border)] text-xs"
                >
                  <option value="-">Hyphen (-)</option>
                  <option value=".">Period (.)</option>
                  <option value="_">Underscore (_)</option>
                  <option value=" ">Space</option>
                </select>
              </label>

              <label className="flex items-center justify-between p-3 rounded-xl bg-[var(--vl-bg)] border border-[var(--vl-border)] cursor-pointer">
                <span className="text-xs font-medium">Capitalize words</span>
                <input
                  type="checkbox"
                  checked={capitalize}
                  onChange={(e) => setCapitalize(e.target.checked)}
                  className="w-4 h-4 accent-[var(--vl-accent)]"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-xl bg-[var(--vl-bg)] border border-[var(--vl-border)] cursor-pointer">
                <span className="text-xs font-medium">Include 2-digit number</span>
                <input
                  type="checkbox"
                  checked={includeNumber}
                  onChange={(e) => setIncludeNumber(e.target.checked)}
                  className="w-4 h-4 accent-[var(--vl-accent)]"
                />
              </label>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
