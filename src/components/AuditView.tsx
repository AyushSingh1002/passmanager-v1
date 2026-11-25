import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, CopyCheck, Edit3, Shield } from 'lucide-react';
import { t } from '../core/i18n';
import { runSecurityAudit } from '../core/password';
import type { DecryptedEntry, LanguageCode } from '../types/vault';
import { CountdownRing } from './ui/CountdownRing';

interface AuditViewProps {
  entries: DecryptedEntry[];
  language: LanguageCode;
  onEditEntry: (entry: DecryptedEntry) => void;
}

export const AuditView: React.FC<AuditViewProps> = ({ entries, language, onEditEntry }) => {
  const report = useMemo(() => runSecurityAudit(entries), [entries]);
  const [tab, setTab] = useState<'weak' | 'reused' | 'old'>('weak');

  const scoreColor =
    report.overallScore >= 80
      ? 'var(--vl-strong)'
      : report.overallScore >= 50
        ? 'var(--vl-fair)'
        : 'var(--vl-weak)';

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-vl-rise">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{t(language, 'audit')}</h1>
        <p className="text-xs text-[var(--vl-text-secondary)] mt-0.5">
          100% local analysis of weak, reused, and stale (&gt;1 year) passwords. Zero external breach lookups.
        </p>
      </div>

      {/* Summary Score + Breakdown */}
      <div className="rounded-2xl bg-[var(--vl-surface)] border border-[var(--vl-border)] p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="relative flex items-center justify-center" style={{ color: scoreColor }}>
            <CountdownRing
              remainingSeconds={report.overallScore}
              totalSeconds={100}
              size={64}
              strokeWidth={5}
            />
            <span className="absolute text-base font-semibold tabular-nums">
              {report.overallScore}
            </span>
          </div>
          <div>
            <div className="text-base font-semibold">Vault health score</div>
            <div className="text-xs text-[var(--vl-text-secondary)] tabular-nums mt-0.5">
              {report.totalWithPasswords} entries with passwords evaluated locally
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 sm:gap-6 text-left sm:text-right">
          <div>
            <div className="text-lg font-semibold tabular-nums text-[var(--vl-weak)]">
              {report.weakEntries.length}
            </div>
            <div className="text-xs text-[var(--vl-text-secondary)]">Weak</div>
          </div>
          <div>
            <div className="text-lg font-semibold tabular-nums text-[var(--vl-fair)]">
              {report.reusedGroups.length}
            </div>
            <div className="text-xs text-[var(--vl-text-secondary)]">Reused groups</div>
          </div>
          <div>
            <div className="text-lg font-semibold tabular-nums">
              {report.oldEntries.length}
            </div>
            <div className="text-xs text-[var(--vl-text-secondary)]">Over 1 year</div>
          </div>
        </div>
      </div>

      {/* Category Filter Tabs */}
      <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[var(--vl-surface-muted)] w-fit">
        <button
          type="button"
          onClick={() => setTab('weak')}
          className={`px-3.5 py-2 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 ${
            tab === 'weak' ? 'bg-[var(--vl-surface)] shadow-sm' : 'text-[var(--vl-text-secondary)]'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>Weak ({report.weakEntries.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setTab('reused')}
          className={`px-3.5 py-2 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 ${
            tab === 'reused' ? 'bg-[var(--vl-surface)] shadow-sm' : 'text-[var(--vl-text-secondary)]'
          }`}
        >
          <CopyCheck className="w-3.5 h-3.5" />
          <span>Reused ({report.reusedGroups.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setTab('old')}
          className={`px-3.5 py-2 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 ${
            tab === 'old' ? 'bg-[var(--vl-surface)] shadow-sm' : 'text-[var(--vl-text-secondary)]'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Old &gt; 1y ({report.oldEntries.length})</span>
        </button>
      </div>

      <div className="rounded-2xl bg-[var(--vl-surface)] border border-[var(--vl-border)] divide-y divide-[var(--vl-border)]">
        {tab === 'weak' &&
          (report.weakEntries.length === 0 ? (
            <div className="p-8 text-center space-y-1.5">
              <CheckCircle2 className="w-6 h-6 mx-auto text-[var(--vl-strong)]" />
              <p className="text-sm font-medium">No weak passwords detected</p>
            </div>
          ) : (
            report.weakEntries.map(({ entry, strength }) => (
              <div key={entry.id} className="p-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{entry.data.title}</div>
                  <div className="text-xs text-[var(--vl-text-secondary)] mt-0.5">
                    <span className="text-[var(--vl-weak)] font-medium">{strength.label}</span>
                    <span aria-hidden="true"> · </span>
                    <span>{strength.feedback[0]}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onEditEntry(entry)}
                  className="h-9 px-3.5 rounded-xl bg-[var(--vl-accent)] text-white text-xs font-medium inline-flex items-center gap-1.5 shrink-0"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Change</span>
                </button>
              </div>
            ))
          ))}

        {tab === 'reused' &&
          (report.reusedGroups.length === 0 ? (
            <div className="p-8 text-center space-y-1.5">
              <Shield className="w-6 h-6 mx-auto text-[var(--vl-strong)]" />
              <p className="text-sm font-medium">Every password is unique</p>
            </div>
          ) : (
            report.reusedGroups.map((group, idx) => (
              <div key={idx} className="p-4 space-y-2.5">
                <div className="text-xs text-[var(--vl-text-secondary)]">
                  Shared password <span className="font-mono-secret">{group.passwordMask}</span> across{' '}
                  <span className="tabular-nums font-medium">{group.entries.length}</span> entries
                </div>
                <div className="space-y-2">
                  {group.entries.map((entry) => (
                    <div key={entry.id} className="flex items-center justify-between gap-3 pl-2">
                      <span className="text-sm font-medium truncate">{entry.data.title}</span>
                      <button
                        type="button"
                        onClick={() => onEditEntry(entry)}
                        className="h-8 px-3 rounded-lg border border-[var(--vl-border)] text-xs font-medium hover:bg-[var(--vl-surface-muted)]"
                      >
                        Change
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))
          ))}

        {tab === 'old' &&
          (report.oldEntries.length === 0 ? (
            <div className="p-8 text-center space-y-1.5">
              <CheckCircle2 className="w-6 h-6 mx-auto text-[var(--vl-strong)]" />
              <p className="text-sm font-medium">All passwords updated within the past year</p>
            </div>
          ) : (
            report.oldEntries.map(({ entry, ageDays }) => (
              <div key={entry.id} className="p-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{entry.data.title}</div>
                  <div className="text-xs text-[var(--vl-text-secondary)] tabular-nums mt-0.5">
                    Last rotated {ageDays} days ago
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onEditEntry(entry)}
                  className="h-9 px-3.5 rounded-xl border border-[var(--vl-border)] hover:bg-[var(--vl-surface-muted)] text-xs font-medium"
                >
                  Rotate
                </button>
              </div>
            ))
          ))}
      </div>
    </div>
  );
};
