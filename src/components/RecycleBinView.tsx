import React from 'react';
import { RotateCcw, Trash2 } from 'lucide-react';
import { t } from '../core/i18n';
import type { DecryptedEntry, LanguageCode } from '../types/vault';

interface RecycleBinViewProps {
  entries: DecryptedEntry[];
  language: LanguageCode;
  onRestore: (id: string) => Promise<void>;
  onDeleteForever: (id: string) => Promise<void>;
  onEmptyBin: () => Promise<void>;
}

export const RecycleBinView: React.FC<RecycleBinViewProps> = ({
  entries,
  language,
  onRestore,
  onDeleteForever,
  onEmptyBin,
}) => {
  const deletedEntries = entries.filter((e) => e.deletedAt !== null);
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-vl-rise">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t(language, 'recycleBin')}</h1>
          <p className="text-xs text-[var(--vl-text-secondary)] mt-0.5">
            Deleted items are retained for 30 days before permanent removal.
          </p>
        </div>
        {deletedEntries.length > 0 && (
          <button
            type="button"
            onClick={onEmptyBin}
            className="h-9 px-3.5 rounded-xl border border-[var(--vl-weak)] text-[var(--vl-weak)] text-xs font-medium"
          >
            Empty bin
          </button>
        )}
      </div>

      <div className="rounded-2xl bg-[var(--vl-surface)] border border-[var(--vl-border)] divide-y divide-[var(--vl-border)]">
        {deletedEntries.length === 0 ? (
          <div className="p-8 text-center space-y-1">
            <p className="text-sm font-medium">Recycle bin is empty</p>
            <p className="text-xs text-[var(--vl-text-secondary)]">
              Deleted entries appear here for 30 days in case you need to restore them.
            </p>
          </div>
        ) : (
          deletedEntries.map((entry) => {
            const elapsed = Date.now() - (entry.deletedAt ?? Date.now());
            const daysLeft = Math.max(0, Math.ceil((thirtyDaysMs - elapsed) / (24 * 60 * 60 * 1000)));
            return (
              <div key={entry.id} className="p-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{entry.data.title}</div>
                  <div className="text-xs text-[var(--vl-text-secondary)] tabular-nums mt-0.5">
                    {entry.data.username || entry.data.type} · {daysLeft} days left
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onRestore(entry.id)}
                    className="h-9 px-3 rounded-xl border border-[var(--vl-border)] hover:bg-[var(--vl-surface-muted)] text-xs font-medium inline-flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>{t(language, 'restore')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteForever(entry.id)}
                    aria-label={`Permanently delete ${entry.data.title}`}
                    className="w-9 h-9 rounded-xl border border-[var(--vl-border)] hover:text-[var(--vl-weak)] flex items-center justify-center"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
