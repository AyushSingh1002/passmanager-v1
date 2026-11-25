import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Copy,
  Edit3,
  Eye,
  EyeOff,
  History,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Star,
  Trash2,
} from 'lucide-react';
import { generateTotpCode } from '../core/crypto';
import { t } from '../core/i18n';
import { evaluatePasswordStrength } from '../core/password';
import type { DecryptedEntry, EntryType, LanguageCode } from '../types/vault';
import { CountdownRing } from './ui/CountdownRing';
import { StrengthMeter } from './ui/StrengthMeter';

type VaultFilter = 'ALL' | EntryType | 'FAVOURITES' | 'WEAK';

interface VaultViewProps {
  entries: DecryptedEntry[];
  language: LanguageCode;
  selectedId: string | null;
  onSelectEntry: (id: string | null) => void;
  onAddEntry: () => void;
  onOpenSmartImport: () => void;
  onEditEntry: (entry: DecryptedEntry) => void;
  onDeleteEntry: (id: string) => Promise<void>;
  onToggleFavourite: (entry: DecryptedEntry) => Promise<void>;
  onRestoreHistoryPassword: (entry: DecryptedEntry, oldPassword: string) => Promise<void>;
  onCopySecret: (label: string, value: string) => void;
  activeCopyLabel: string | null;
  copyRemainingSeconds: number;
  copyTotalSeconds: number;
}

const TYPE_LABELS: Record<EntryType, string> = {
  LOGIN: 'Login',
  BANK: 'Bank / UPI',
  CARD: 'Card',
  WIFI: 'Wi-Fi',
  NOTE: 'Secure note',
  IDENTITY: 'Identity',
};

function formatRelativeTime(ts: number): string {
  const diffDays = Math.floor((Date.now() - ts) / (24 * 60 * 60 * 1000));
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 30) return `${diffDays}d ago`;
  const months = Math.floor(diffDays / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export const VaultView: React.FC<VaultViewProps> = ({
  entries,
  language,
  selectedId,
  onSelectEntry,
  onAddEntry,
  onOpenSmartImport,
  onEditEntry,
  onDeleteEntry,
  onToggleFavourite,
  onRestoreHistoryPassword,
  onCopySecret,
  activeCopyLabel,
  copyRemainingSeconds,
  copyTotalSeconds,
}) => {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<VaultFilter>('ALL');
  const [revealedIds, setRevealedIds] = useState<Record<string, boolean>>({});
  const [holdReveal, setHoldReveal] = useState(false);
  const [totpState, setTotpState] = useState<{ code: string; remaining: number; period: number } | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const activeEntries = useMemo(
    () =>
      entries
        .filter((e) => e.deletedAt === null)
        .sort((a, b) => {
          if (a.data.favourite !== b.data.favourite) return a.data.favourite ? -1 : 1;
          return b.updatedAt - a.updatedAt;
        }),
    [entries]
  );

  const filteredEntries = useMemo(() => {
    const q = query.trim().toLowerCase();
    return activeEntries.filter((entry) => {
      if (filter === 'FAVOURITES' && !entry.data.favourite) return false;
      if (filter === 'WEAK') {
        const pw = entry.data.password ?? '';
        if (!pw || evaluatePasswordStrength(pw).score > 2) return false;
      } else if (filter !== 'ALL' && filter !== 'FAVOURITES' && entry.data.type !== filter) {
        return false;
      }

      if (!q) return true;
      const hay = [
        entry.data.title,
        entry.data.username ?? '',
        entry.data.wifiSsid ?? '',
        entry.data.upiId ?? '',
        ...entry.data.urls,
        ...entry.data.tags,
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [activeEntries, filter, query]);

  const selectedEntry = useMemo(
    () => activeEntries.find((e) => e.id === selectedId) ?? null,
    [activeEntries, selectedId]
  );

  // Reset reveal state when switching entries
  useEffect(() => {
    setHoldReveal(false);
    setShowHistory(false);
  }, [selectedId]);

  // Live RFC 6238 TOTP ticker for selected entry
  useEffect(() => {
    const secret = selectedEntry?.data.totpSecret;
    if (!secret) {
      setTotpState(null);
      return;
    }
    let cancelled = false;
    const update = async () => {
      try {
        const res = await generateTotpCode(secret);
        if (!cancelled) {
          setTotpState({ code: res.code, remaining: res.remainingSeconds, period: res.periodSeconds });
        }
      } catch {
        if (!cancelled) setTotpState(null);
      }
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [selectedEntry?.data.totpSecret]);

  const filters: Array<{ id: VaultFilter; label: string }> = [
    { id: 'ALL', label: t(language, 'all') },
    { id: 'LOGIN', label: t(language, 'logins') },
    { id: 'BANK', label: t(language, 'bankUpi') },
    { id: 'CARD', label: t(language, 'cards') },
    { id: 'WIFI', label: t(language, 'wifi') },
    { id: 'NOTE', label: t(language, 'notes') },
    { id: 'FAVOURITES', label: t(language, 'favourites') },
    { id: 'WEAK', label: t(language, 'weak') },
  ];

  const isPasswordRevealed = Boolean(
    selectedEntry && (revealedIds[selectedEntry.id] || holdReveal)
  );

  const renderCopyButton = (label: string, value: string) => {
    const isCopied = activeCopyLabel === label;
    return (
      <button
        type="button"
        onClick={() => onCopySecret(label, value)}
        aria-label={`Copy ${label}`}
        className="h-10 px-3 rounded-xl border border-[var(--vl-border)] hover:bg-[var(--vl-surface-muted)] text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
      >
        {isCopied ? (
          <>
            <Check className="w-3.5 h-3.5 text-[var(--vl-strong)]" />
            <span className="text-[var(--vl-strong)]">{t(language, 'copied')}</span>
            {copyTotalSeconds > 0 && (
              <CountdownRing
                remainingSeconds={copyRemainingSeconds}
                totalSeconds={copyTotalSeconds}
                size={16}
                strokeWidth={2}
                className="text-[var(--vl-accent)]"
              />
            )}
          </>
        ) : (
          <>
            <Copy className="w-3.5 h-3.5 text-[var(--vl-text-secondary)]" />
            <span>{t(language, 'copy')}</span>
          </>
        )}
      </button>
    );
  };

  return (
    <div className="flex flex-col md:flex-row h-full min-h-[calc(100vh-4rem)] md:min-h-[calc(100vh-2rem)] gap-4">
      {/* Left Pane: Search + Filter + Entry List */}
      <section
        aria-label="Vault entries list"
        className={`w-full md:w-[360px] lg:w-[400px] shrink-0 flex flex-col bg-[var(--vl-surface)] border border-[var(--vl-border)] rounded-2xl overflow-hidden ${
          selectedEntry ? 'hidden md:flex' : 'flex'
        }`}
      >
        <div className="p-4 border-b border-[var(--vl-border)] space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-lg font-semibold tracking-tight">
              {t(language, 'vault')}
              <span className="ml-2 text-xs font-normal tabular-nums text-[var(--vl-text-secondary)]">
                {filteredEntries.length}
              </span>
            </h1>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onOpenSmartImport}
                className="h-9 px-3 rounded-xl bg-[var(--vl-surface-muted)] hover:opacity-90 text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Sparkles className="w-3.5 h-3.5 text-[var(--vl-accent)]" />
                <span>Smart Import</span>
              </button>
              <button
                type="button"
                onClick={onAddEntry}
                aria-label={t(language, 'addEntry')}
                className="h-9 px-3 rounded-xl bg-[var(--vl-accent-btn)] hover:bg-[var(--vl-accent-hover)] text-white text-xs font-medium inline-flex items-center gap-1 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New</span>
              </button>
            </div>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-[var(--vl-text-secondary)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t(language, 'searchPlaceholder')}
              aria-label="Search vault entries"
              className="w-full h-11 pl-10 pr-3.5 rounded-xl bg-[var(--vl-bg)] border border-[var(--vl-border)] text-sm focus:outline-none focus:border-[var(--vl-accent)]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {filters.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                  filter === f.id
                    ? 'bg-[var(--vl-accent-soft)] text-[var(--vl-accent)]'
                    : 'bg-[var(--vl-surface-muted)] text-[var(--vl-text-secondary)] hover:text-[var(--vl-text-primary)]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-[var(--vl-border)]">
          {filteredEntries.length === 0 ? (
            <div className="p-8 text-center space-y-3">
              <p className="text-sm font-medium">{t(language, 'noEntriesTitle')}</p>
              <p className="text-xs text-[var(--vl-text-secondary)] leading-relaxed">
                {t(language, 'noEntriesBody')}
              </p>
              <div className="flex items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={onAddEntry}
                  className="h-10 px-4 rounded-xl bg-[var(--vl-accent)] text-white text-xs font-medium"
                >
                  {t(language, 'addEntry')}
                </button>
                <button
                  type="button"
                  onClick={onOpenSmartImport}
                  className="h-10 px-4 rounded-xl border border-[var(--vl-border)] text-xs font-medium"
                >
                  Smart Import
                </button>
              </div>
            </div>
          ) : (
            filteredEntries.map((entry) => {
              const isSelected = selectedEntry?.id === entry.id;
              const initials = entry.data.title.slice(0, 2).toUpperCase();
              const subtitle =
                entry.data.username ||
                entry.data.wifiSsid ||
                entry.data.upiId ||
                (entry.data.cardNumber ? entry.data.cardNumber.slice(-4).padStart(8, '•') : '') ||
                (entry.data.notes ? entry.data.notes.slice(0, 32) : '');

              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => onSelectEntry(entry.id)}
                  className={`w-full min-h-[64px] px-4 py-3 flex items-center gap-3.5 text-left transition-colors ${
                    isSelected
                      ? 'bg-[var(--vl-accent-soft)]'
                      : 'hover:bg-[var(--vl-surface-muted)]'
                  }`}
                >
                  <div className="w-10 h-10 rounded-xl bg-[var(--vl-surface-muted)] text-[var(--vl-text-primary)] font-semibold text-xs flex items-center justify-center shrink-0">
                    {initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium truncate">{entry.data.title}</span>
                      {entry.data.favourite && (
                        <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400 shrink-0" />
                      )}
                    </div>
                    <div className="text-xs text-[var(--vl-text-secondary)] truncate mt-0.5">
                      {subtitle ? (
                        <>
                          <span>{subtitle}</span>
                          <span aria-hidden="true"> · </span>
                        </>
                      ) : null}
                      <span>{TYPE_LABELS[entry.data.type]}</span>
                      {entry.data.totpSecret && (
                        <>
                          <span aria-hidden="true"> · </span>
                          <span>2FA</span>
                        </>
                      )}
                    </div>
                  </div>
                  <span className="text-xs tabular-nums text-[var(--vl-text-secondary)] shrink-0">
                    {formatRelativeTime(entry.updatedAt)}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </section>

      {/* Right Pane: Entry Detail */}
      <section
        aria-label="Entry details"
        className={`flex-1 bg-[var(--vl-surface)] border border-[var(--vl-border)] rounded-2xl overflow-y-auto ${
          selectedEntry ? 'block' : 'hidden md:flex md:items-center md:justify-center'
        }`}
      >
        {!selectedEntry ? (
          <div className="p-8 text-center max-w-sm space-y-2">
            <h2 className="text-base font-semibold">Select an entry</h2>
            <p className="text-xs text-[var(--vl-text-secondary)] leading-relaxed">
              Choose an account from the list to inspect credentials, copy passwords with 30-second clipboard auto-clear, or view live 2FA codes.
            </p>
          </div>
        ) : (
          <div className="p-5 sm:p-8 space-y-6 animate-vl-rise">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3.5 min-w-0">
                <button
                  type="button"
                  onClick={() => onSelectEntry(null)}
                  aria-label="Back to vault list"
                  className="md:hidden w-10 h-10 rounded-xl border border-[var(--vl-border)] flex items-center justify-center shrink-0"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="w-12 h-12 rounded-2xl bg-[var(--vl-accent-soft)] text-[var(--vl-accent)] font-semibold text-base flex items-center justify-center shrink-0">
                  {selectedEntry.data.title.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h2 className="text-xl font-semibold tracking-tight truncate">
                    {selectedEntry.data.title}
                  </h2>
                  <p className="text-xs text-[var(--vl-text-secondary)] mt-0.5">
                    {TYPE_LABELS[selectedEntry.data.type]}
                    <span aria-hidden="true"> · </span>
                    <span>Updated {new Date(selectedEntry.updatedAt).toLocaleDateString()}</span>
                    {selectedEntry.data.tags.length > 0 && (
                      <>
                        <span aria-hidden="true"> · </span>
                        <span>{selectedEntry.data.tags.join(', ')}</span>
                      </>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => onToggleFavourite(selectedEntry)}
                  aria-label={selectedEntry.data.favourite ? 'Unpin favourite' : 'Pin favourite'}
                  className="w-10 h-10 rounded-xl border border-[var(--vl-border)] flex items-center justify-center hover:bg-[var(--vl-surface-muted)]"
                >
                  <Star
                    className={`w-4 h-4 ${
                      selectedEntry.data.favourite
                        ? 'fill-amber-400 text-amber-400'
                        : 'text-[var(--vl-text-secondary)]'
                    }`}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => onEditEntry(selectedEntry)}
                  aria-label={`Edit ${selectedEntry.data.title}`}
                  className="h-10 px-3.5 rounded-xl border border-[var(--vl-border)] hover:bg-[var(--vl-surface-muted)] text-xs font-medium inline-flex items-center gap-1.5"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>{t(language, 'edit')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteEntry(selectedEntry.id)}
                  aria-label={`Delete ${selectedEntry.data.title}`}
                  className="w-10 h-10 rounded-xl border border-[var(--vl-border)] hover:text-[var(--vl-weak)] flex items-center justify-center"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="divide-y divide-[var(--vl-border)] border-t border-b border-[var(--vl-border)]">
              {selectedEntry.data.username && (
                <div className="py-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-xs text-[var(--vl-text-secondary)]">Username / Email</div>
                    <div className="text-sm font-medium mt-0.5 break-all">{selectedEntry.data.username}</div>
                  </div>
                  {renderCopyButton('Username', selectedEntry.data.username)}
                </div>
              )}

              {selectedEntry.data.wifiSsid && (
                <div className="py-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-xs text-[var(--vl-text-secondary)]">
                      Wi-Fi Network ({selectedEntry.data.wifiSecurity ?? 'WPA3'})
                    </div>
                    <div className="text-sm font-medium mt-0.5">{selectedEntry.data.wifiSsid}</div>
                  </div>
                  {renderCopyButton('SSID', selectedEntry.data.wifiSsid)}
                </div>
              )}

              {selectedEntry.data.password && (
                <div className="py-4 space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-[var(--vl-text-secondary)]">Password</div>
                      <div className="text-sm font-mono-secret mt-0.5 break-all">
                        {isPasswordRevealed
                          ? selectedEntry.data.password
                          : '•'.repeat(Math.min(18, selectedEntry.data.password.length))}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          setRevealedIds((prev) => ({
                            ...prev,
                            [selectedEntry.id]: !prev[selectedEntry.id],
                          }))
                        }
                        onPointerDown={() => setHoldReveal(true)}
                        onPointerUp={() => setHoldReveal(false)}
                        onPointerLeave={() => setHoldReveal(false)}
                        aria-label={isPasswordRevealed ? 'Hide password' : 'Reveal password'}
                        className="h-10 px-3 rounded-xl border border-[var(--vl-border)] hover:bg-[var(--vl-surface-muted)] text-xs font-medium inline-flex items-center gap-1.5"
                      >
                        {isPasswordRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        <span>{isPasswordRevealed ? t(language, 'hide') : t(language, 'reveal')}</span>
                      </button>
                      {renderCopyButton('Password', selectedEntry.data.password)}
                    </div>
                  </div>
                  <StrengthMeter password={selectedEntry.data.password} />
                </div>
              )}

              {selectedEntry.data.pin && (
                <div className="py-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-xs text-[var(--vl-text-secondary)]">MPIN / PIN</div>
                    <div className="text-sm font-mono-secret mt-0.5">
                      {isPasswordRevealed ? selectedEntry.data.pin : '••••'}
                    </div>
                  </div>
                  {renderCopyButton('PIN', selectedEntry.data.pin)}
                </div>
              )}

              {totpState && (
                <div className="py-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <CountdownRing
                      remainingSeconds={totpState.remaining}
                      totalSeconds={totpState.period}
                      size={36}
                      strokeWidth={3}
                      className="text-[var(--vl-accent)]"
                    />
                    <div>
                      <div className="text-xs text-[var(--vl-text-secondary)]">
                        2FA Authenticator · <span className="tabular-nums">{totpState.remaining}s</span>
                      </div>
                      <div className="text-xl font-semibold font-mono-secret tracking-wider mt-0.5">
                        {totpState.code.slice(0, 3)} {totpState.code.slice(3)}
                      </div>
                    </div>
                  </div>
                  {renderCopyButton('2FA Code', totpState.code)}
                </div>
              )}

              {selectedEntry.data.cardNumber && (
                <div className="py-4 space-y-2">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-xs text-[var(--vl-text-secondary)]">Card Number</div>
                      <div className="text-sm font-mono-secret mt-0.5">{selectedEntry.data.cardNumber}</div>
                    </div>
                    {renderCopyButton('Card Number', selectedEntry.data.cardNumber)}
                  </div>
                  <div className="text-xs text-[var(--vl-text-secondary)]">
                    Holder: {selectedEntry.data.cardHolder || '—'} · Exp: {selectedEntry.data.cardExpiry || '—'} · CVV:{' '}
                    <span className="font-mono-secret">
                      {isPasswordRevealed ? selectedEntry.data.cardCvv || '—' : '•••'}
                    </span>
                  </div>
                </div>
              )}

              {(selectedEntry.data.bankAccountNumber || selectedEntry.data.upiId) && (
                <div className="py-4 space-y-2">
                  {selectedEntry.data.bankAccountNumber && (
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-xs text-[var(--vl-text-secondary)]">Account / IFSC</div>
                        <div className="text-sm font-mono-secret mt-0.5">
                          {selectedEntry.data.bankAccountNumber}
                          {selectedEntry.data.bankIfsc ? ` · ${selectedEntry.data.bankIfsc}` : ''}
                        </div>
                      </div>
                      {renderCopyButton('Account Number', selectedEntry.data.bankAccountNumber)}
                    </div>
                  )}
                  {selectedEntry.data.upiId && (
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-xs text-[var(--vl-text-secondary)]">UPI ID</div>
                        <div className="text-sm mt-0.5">{selectedEntry.data.upiId}</div>
                      </div>
                      {renderCopyButton('UPI ID', selectedEntry.data.upiId)}
                    </div>
                  )}
                </div>
              )}

              {selectedEntry.data.urls.length > 0 && (
                <div className="py-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-xs text-[var(--vl-text-secondary)]">Website</div>
                    <div className="text-sm mt-0.5 break-all text-[var(--vl-accent)]">
                      {selectedEntry.data.urls.join(', ')}
                    </div>
                  </div>
                  {renderCopyButton('URL', selectedEntry.data.urls[0])}
                </div>
              )}

              {selectedEntry.data.customFields.map((cf) => (
                <div key={cf.id} className="py-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-xs text-[var(--vl-text-secondary)]">{cf.label}</div>
                    <div className="text-sm mt-0.5 break-all">{cf.value}</div>
                  </div>
                  {renderCopyButton(cf.label, cf.value)}
                </div>
              ))}

              {selectedEntry.data.notes && (
                <div className="py-4">
                  <div className="text-xs text-[var(--vl-text-secondary)]">Notes</div>
                  <p className="text-sm mt-1 whitespace-pre-wrap leading-relaxed">
                    {selectedEntry.data.notes}
                  </p>
                </div>
              )}
            </div>

            {/* Password History */}
            {selectedEntry.history.length > 0 && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setShowHistory((v) => !v)}
                  className="text-xs font-medium text-[var(--vl-text-secondary)] hover:text-[var(--vl-text-primary)] inline-flex items-center gap-1.5"
                >
                  <History className="w-3.5 h-3.5" />
                  <span>
                    Password history ({selectedEntry.history.length} previous version
                    {selectedEntry.history.length === 1 ? '' : 's'})
                  </span>
                </button>
                {showHistory && (
                  <div className="rounded-xl border border-[var(--vl-border)] divide-y divide-[var(--vl-border)]">
                    {selectedEntry.history.map((h, i) => (
                      <div key={`${h.savedAt}-${i}`} className="px-3.5 py-2.5 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs font-mono-secret truncate">
                            {isPasswordRevealed ? h.password : '••••••••••••'}
                          </div>
                          <div className="text-[11px] text-[var(--vl-text-secondary)]">
                            Saved {new Date(h.savedAt).toLocaleDateString()}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onRestoreHistoryPassword(selectedEntry, h.password)}
                          className="h-8 px-2.5 rounded-lg border border-[var(--vl-border)] text-xs font-medium inline-flex items-center gap-1 hover:bg-[var(--vl-surface-muted)]"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Restore</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
};
